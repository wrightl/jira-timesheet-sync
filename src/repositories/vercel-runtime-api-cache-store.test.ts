import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeCache } from "@vercel/functions";
import { VercelRuntimeApiCacheStore } from "@/repositories/vercel-runtime-api-cache-store";

function createMemoryRuntimeCache(): RuntimeCache {
  const values = new Map<string, unknown>();
  const tags = new Map<string, Set<string>>();

  return {
    async get(key) {
      return values.has(key) ? values.get(key)! : null;
    },
    async set(key, value, options) {
      values.set(key, value);
      for (const tag of options?.tags ?? []) {
        const set = tags.get(tag) ?? new Set();
        set.add(key);
        tags.set(tag, set);
      }
    },
    async delete(key) {
      values.delete(key);
      for (const set of tags.values()) {
        set.delete(key);
      }
    },
    async expireTag(tag) {
      const list = Array.isArray(tag) ? tag : [tag];
      for (const t of list) {
        for (const key of tags.get(t) ?? []) {
          values.delete(key);
        }
        tags.delete(t);
      }
    },
  };
}

describe("VercelRuntimeApiCacheStore", () => {
  let runtime: RuntimeCache;
  let store: VercelRuntimeApiCacheStore;

  beforeEach(() => {
    runtime = createMemoryRuntimeCache();
    store = new VercelRuntimeApiCacheStore(runtime);
  });

  it("round-trips getValidByKey after upsert", async () => {
    const now = new Date();
    await store.upsert({
      cacheKey: "projects:c1:a:b",
      resourceType: "projects",
      requestMeta: JSON.stringify({ clientId: "c1" }),
      responseBody: JSON.stringify({ ok: true }),
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      updatedAt: now,
    });

    const entry = await store.getValidByKey("projects:c1:a:b");
    expect(entry?.responseBody).toBe(JSON.stringify({ ok: true }));
    expect(entry?.resourceType).toBe("projects");
    expect(entry?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("returns null for expired entries and removes them", async () => {
    const now = new Date();
    await store.upsert({
      cacheKey: "projects:old",
      resourceType: "projects",
      requestMeta: "{}",
      responseBody: "{}",
      fetchedAt: now,
      expiresAt: new Date(now.getTime() - 1_000),
      updatedAt: now,
    });

    await expect(store.getValidByKey("projects:old")).resolves.toBeNull();
    await expect(store.list()).resolves.toEqual([]);
  });

  it("lists live entries and supports deleteById / deleteAll", async () => {
    const now = new Date();
    await store.upsert({
      cacheKey: "projects:one",
      resourceType: "projects",
      requestMeta: "{}",
      responseBody: '{"n":1}',
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      updatedAt: now,
    });
    await store.upsert({
      cacheKey: "project_budgets:p1",
      resourceType: "project_budgets",
      requestMeta: "{}",
      responseBody: "[]",
      fetchedAt: new Date(now.getTime() + 1),
      expiresAt: new Date(now.getTime() + 60_000),
      updatedAt: now,
    });

    const listed = await store.list();
    expect(listed.map((e) => e.cacheKey)).toEqual([
      "project_budgets:p1",
      "projects:one",
    ]);

    const deleted = await store.deleteById(listed[1]!.id);
    expect(deleted?.cacheKey).toBe("projects:one");
    await expect(store.getValidByKey("projects:one")).resolves.toBeNull();

    await store.deleteAll();
    await expect(store.list()).resolves.toEqual([]);
    await expect(store.getValidByKey("project_budgets:p1")).resolves.toBeNull();
  });

  it("preserves id across upserts of the same key", async () => {
    const now = new Date();
    await store.upsert({
      cacheKey: "projects:same",
      resourceType: "projects",
      requestMeta: "{}",
      responseBody: '{"v":1}',
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      updatedAt: now,
    });
    const first = await store.getValidByKey("projects:same");

    await store.upsert({
      cacheKey: "projects:same",
      resourceType: "projects",
      requestMeta: "{}",
      responseBody: '{"v":2}',
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      updatedAt: now,
    });
    const second = await store.getValidByKey("projects:same");
    expect(second?.id).toBe(first?.id);
    expect(second?.responseBody).toBe('{"v":2}');
  });
});

describe("createApiCacheStore branching", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses VercelRuntimeApiCacheStore when VERCEL=1", async () => {
    const vercelCtor = vi.fn(function MockVercelStore() {
      return { backend: "vercel" };
    });
    vi.doMock("@/repositories/vercel-runtime-api-cache-store", () => ({
      VercelRuntimeApiCacheStore: vercelCtor,
    }));
    vi.doMock("@/repositories/api-cache-repository", () => ({
      ApiCacheRepository: vi.fn(function MockDbStore() {
        return { backend: "db" };
      }),
    }));
    vi.doMock("@/db", () => ({
      getDb: vi.fn(),
    }));

    const { createApiCacheStore } = await import("@/services/api-cache");
    const store = createApiCacheStore(undefined, { VERCEL: "1" });
    expect(vercelCtor).toHaveBeenCalledOnce();
    expect(store).toEqual({ backend: "vercel" });
  });

  it("uses ApiCacheRepository when not on Vercel", async () => {
    const dbCtor = vi.fn(function MockDbStore() {
      return { backend: "db" };
    });
    vi.doMock("@/repositories/vercel-runtime-api-cache-store", () => ({
      VercelRuntimeApiCacheStore: vi.fn(),
    }));
    vi.doMock("@/repositories/api-cache-repository", () => ({
      ApiCacheRepository: dbCtor,
    }));
    vi.doMock("@/db", () => ({
      getDb: vi.fn(),
    }));

    const { createApiCacheStore } = await import("@/services/api-cache");
    const fakeDb = {} as never;
    const store = createApiCacheStore(fakeDb, {});
    expect(dbCtor).toHaveBeenCalledWith(fakeDb);
    expect(store).toEqual({ backend: "db" });
  });
});
