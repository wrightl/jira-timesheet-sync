import { randomUUID } from "node:crypto";
import { getCache, type RuntimeCache } from "@vercel/functions";
import type { ApiCacheEntry, NewApiCacheEntry } from "@/db/schema";
import type { ApiCacheStore } from "@/repositories/api-cache-store";

const INDEX_KEY = "__index__";
const ENTRY_TAG = "api-cache";
/** Keep the key index around longer than entry TTLs (refreshed on writes). */
const INDEX_TTL_SECONDS = 48 * 60 * 60;

type StoredEntry = {
  id: string;
  cacheKey: string;
  resourceType: ApiCacheEntry["resourceType"];
  requestMeta: string;
  responseBody: string;
  fetchedAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

function toEntry(stored: StoredEntry): ApiCacheEntry {
  return {
    id: stored.id,
    cacheKey: stored.cacheKey,
    resourceType: stored.resourceType,
    requestMeta: stored.requestMeta,
    responseBody: stored.responseBody,
    fetchedAt: new Date(stored.fetchedAt),
    expiresAt: new Date(stored.expiresAt),
    createdAt: new Date(stored.createdAt),
    updatedAt: new Date(stored.updatedAt),
  };
}

function isStoredEntry(value: unknown): value is StoredEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.cacheKey === "string" &&
    typeof v.resourceType === "string" &&
    typeof v.requestMeta === "string" &&
    typeof v.responseBody === "string" &&
    typeof v.fetchedAt === "string" &&
    typeof v.expiresAt === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.updatedAt === "string"
  );
}

function ttlSecondsUntil(expiresAt: Date, now: Date = new Date()): number {
  return Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
}

export class VercelRuntimeApiCacheStore implements ApiCacheStore {
  constructor(
    private readonly cache: RuntimeCache = getCache({
      namespace: "api-cache",
    }),
  ) {}

  async getValidByKey(cacheKey: string): Promise<ApiCacheEntry | null> {
    const now = new Date();
    const stored = await this.readEntry(cacheKey);
    if (!stored) return null;
    if (stored.expiresAt.getTime() <= now.getTime()) {
      await this.cache.delete(cacheKey);
      await this.removeFromIndex(cacheKey);
      return null;
    }
    return stored;
  }

  async list(): Promise<ApiCacheEntry[]> {
    const now = new Date();
    const keys = await this.readIndex();
    const entries: ApiCacheEntry[] = [];
    const liveKeys: string[] = [];

    for (const cacheKey of keys) {
      const entry = await this.readEntry(cacheKey);
      if (!entry) continue;
      if (entry.expiresAt.getTime() <= now.getTime()) {
        await this.cache.delete(cacheKey);
        continue;
      }
      liveKeys.push(cacheKey);
      entries.push(entry);
    }

    if (liveKeys.length !== keys.length) {
      await this.writeIndex(liveKeys);
    }

    entries.sort((a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime());
    return entries;
  }

  async deleteExpired(now: Date = new Date()): Promise<number> {
    const keys = await this.readIndex();
    let deleted = 0;
    const liveKeys: string[] = [];

    for (const cacheKey of keys) {
      const entry = await this.readEntry(cacheKey);
      if (!entry) continue;
      if (entry.expiresAt.getTime() <= now.getTime()) {
        await this.cache.delete(cacheKey);
        deleted += 1;
        continue;
      }
      liveKeys.push(cacheKey);
    }

    if (liveKeys.length !== keys.length) {
      await this.writeIndex(liveKeys);
    }
    return deleted;
  }

  async upsert(
    values: Omit<NewApiCacheEntry, "id" | "createdAt"> & {
      updatedAt?: Date;
    },
  ): Promise<void> {
    const now = values.updatedAt ?? new Date();
    const existing = await this.readEntry(values.cacheKey);
    const stored: StoredEntry = {
      id: existing?.id ?? randomUUID(),
      cacheKey: values.cacheKey,
      resourceType: values.resourceType,
      requestMeta: values.requestMeta,
      responseBody: values.responseBody,
      fetchedAt: values.fetchedAt.toISOString(),
      expiresAt: values.expiresAt.toISOString(),
      createdAt: (existing?.createdAt ?? now).toISOString(),
      updatedAt: now.toISOString(),
    };

    await this.cache.set(values.cacheKey, stored, {
      ttl: ttlSecondsUntil(values.expiresAt, now),
      tags: [ENTRY_TAG, values.resourceType],
      name: values.cacheKey,
    });

    const keys = await this.readIndex();
    if (!keys.includes(values.cacheKey)) {
      keys.push(values.cacheKey);
      await this.writeIndex(keys);
    } else {
      // Refresh index TTL while entries are being written.
      await this.writeIndex(keys);
    }
  }

  async deleteById(id: string): Promise<ApiCacheEntry | null> {
    const keys = await this.readIndex();
    for (const cacheKey of keys) {
      const entry = await this.readEntry(cacheKey);
      if (!entry || entry.id !== id) continue;
      await this.cache.delete(cacheKey);
      await this.removeFromIndex(cacheKey);
      return entry;
    }
    return null;
  }

  async deleteAll(): Promise<void> {
    await this.cache.expireTag(ENTRY_TAG);
    await this.cache.delete(INDEX_KEY);
  }

  private async readEntry(cacheKey: string): Promise<ApiCacheEntry | null> {
    const value = await this.cache.get(cacheKey);
    if (!isStoredEntry(value)) return null;
    return toEntry(value);
  }

  private async readIndex(): Promise<string[]> {
    const value = await this.cache.get(INDEX_KEY);
    if (!Array.isArray(value)) return [];
    return value.filter((k): k is string => typeof k === "string");
  }

  private async writeIndex(keys: string[]): Promise<void> {
    await this.cache.set(INDEX_KEY, keys, {
      ttl: INDEX_TTL_SECONDS,
      name: "api-cache-index",
    });
  }

  private async removeFromIndex(cacheKey: string): Promise<void> {
    const keys = await this.readIndex();
    const next = keys.filter((k) => k !== cacheKey);
    if (next.length === keys.length) return;
    if (next.length === 0) {
      await this.cache.delete(INDEX_KEY);
      return;
    }
    await this.writeIndex(next);
  }
}
