import { getDb, type Db } from "@/db";
import type { ApiCacheEntry } from "@/db/schema";
import { ApiCacheRepository } from "@/repositories/api-cache-repository";
import type { ApiCacheStore } from "@/repositories/api-cache-store";
import { VercelRuntimeApiCacheStore } from "@/repositories/vercel-runtime-api-cache-store";

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type ApiCacheResourceType = "projects" | "project_budgets";

export function projectsCacheKey(
  clientId: string,
  rangeStart: string,
  rangeEnd: string,
): string {
  return `projects:${clientId}:${rangeStart}:${rangeEnd}`;
}

export function projectBudgetsCacheKey(projectId: string): string {
  return `project_budgets:${projectId}`;
}

export type CacheListEntry = {
  id: string;
  cacheKey: string;
  resourceType: ApiCacheEntry["resourceType"];
  requestMeta: unknown;
  fetchedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  bodyPreview: string;
  bodyLength: number;
  expired: boolean;
  responseBody?: unknown;
};

/** Vercel sets `VERCEL=1` on all hosted deployments (and `vercel dev`). */
export function isVercelHosted(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.VERCEL === "1";
}

export class ApiCacheService {
  constructor(private readonly cache: ApiCacheStore) {}

  async getCachedJson<T>(cacheKey: string): Promise<T | null> {
    const row = await this.cache.getValidByKey(cacheKey);
    if (!row) return null;
    try {
      return JSON.parse(row.responseBody) as T;
    } catch {
      return null;
    }
  }

  async setCachedJson(data: {
    cacheKey: string;
    resourceType: ApiCacheResourceType;
    requestMeta: Record<string, unknown>;
    responseBody: unknown;
  }): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
    await this.cache.upsert({
      cacheKey: data.cacheKey,
      resourceType: data.resourceType,
      requestMeta: JSON.stringify(data.requestMeta),
      responseBody: JSON.stringify(data.responseBody),
      fetchedAt: now,
      expiresAt,
      updatedAt: now,
    });
  }

  async list(includeBody: boolean): Promise<CacheListEntry[]> {
    const rows = await this.cache.list();
    return rows.map((row) => {
      let requestMeta: unknown = row.requestMeta;
      try {
        requestMeta = JSON.parse(row.requestMeta);
      } catch {
        // keep raw
      }

      const base: CacheListEntry = {
        id: row.id,
        cacheKey: row.cacheKey,
        resourceType: row.resourceType,
        requestMeta,
        fetchedAt: row.fetchedAt,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        bodyPreview: row.responseBody.slice(0, 500),
        bodyLength: row.responseBody.length,
        expired: row.expiresAt.getTime() <= Date.now(),
      };

      if (!includeBody) return base;

      let responseBody: unknown = row.responseBody;
      try {
        responseBody = JSON.parse(row.responseBody);
      } catch {
        // keep raw
      }
      return { ...base, responseBody };
    });
  }

  async deleteById(
    id: string,
  ): Promise<{ ok: true; invalidated: string } | { error: "not_found" }> {
    const row = await this.cache.deleteById(id);
    if (!row) return { error: "not_found" };
    return { ok: true, invalidated: row.cacheKey };
  }

  async deleteAll(): Promise<{ ok: true; invalidated: "all" }> {
    await this.cache.deleteAll();
    return { ok: true, invalidated: "all" };
  }
}

export function createApiCacheStore(
  db?: Db,
  env: Record<string, string | undefined> = process.env,
): ApiCacheStore {
  if (isVercelHosted(env)) {
    return new VercelRuntimeApiCacheStore();
  }
  return new ApiCacheRepository(db ?? getDb());
}

export function createApiCacheService(
  db?: Db,
  env: Record<string, string | undefined> = process.env,
) {
  return new ApiCacheService(createApiCacheStore(db, env));
}

/** @deprecated Prefer ApiCacheService methods via createApiCacheService. */
export async function getCachedJson<T>(
  db: Db,
  cacheKey: string,
): Promise<T | null> {
  return createApiCacheService(db).getCachedJson<T>(cacheKey);
}

/** @deprecated Prefer ApiCacheService methods via createApiCacheService. */
export async function setCachedJson(
  db: Db,
  data: {
    cacheKey: string;
    resourceType: ApiCacheResourceType;
    requestMeta: Record<string, unknown>;
    responseBody: unknown;
  },
): Promise<void> {
  return createApiCacheService(db).setCachedJson(data);
}
