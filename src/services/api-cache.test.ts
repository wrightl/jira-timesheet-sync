import { describe, expect, it, vi } from "vitest";
import { ApiCacheService, isVercelHosted } from "@/services/api-cache";
import type { ApiCacheStore } from "@/repositories/api-cache-store";
import type { ApiCacheEntry } from "@/db/schema";

function makeEntry(
  overrides: Partial<ApiCacheEntry> & Pick<ApiCacheEntry, "cacheKey">,
): ApiCacheEntry {
  const now = new Date();
  return {
    id: "11111111-1111-1111-1111-111111111111",
    resourceType: "projects",
    requestMeta: "{}",
    responseBody: '{"ok":true}',
    fetchedAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("isVercelHosted", () => {
  it("returns true when VERCEL is 1", () => {
    expect(isVercelHosted({ VERCEL: "1" })).toBe(true);
  });

  it("returns false when VERCEL is unset or not 1", () => {
    expect(isVercelHosted({})).toBe(false);
    expect(isVercelHosted({ VERCEL: "true" })).toBe(false);
    expect(isVercelHosted({ VERCEL: "0" })).toBe(false);
  });
});

describe("ApiCacheService", () => {
  it("getCachedJson returns parsed JSON for a valid entry", async () => {
    const entry = makeEntry({ cacheKey: "projects:c1:a:b" });
    const cache: Pick<ApiCacheStore, "getValidByKey"> = {
      getValidByKey: vi.fn(async () => entry),
    };
    const service = new ApiCacheService(cache as ApiCacheStore);
    await expect(
      service.getCachedJson<{ ok: boolean }>(entry.cacheKey),
    ).resolves.toEqual({ ok: true });
  });

  it("list marks entries past expiresAt as expired", async () => {
    const expired = makeEntry({
      cacheKey: "projects:old",
      expiresAt: new Date(Date.now() - 1_000),
    });
    const cache: Pick<ApiCacheStore, "list"> = {
      list: vi.fn(async () => [expired]),
    };
    const service = new ApiCacheService(cache as ApiCacheStore);
    const entries = await service.list(false);
    expect(entries[0]?.expired).toBe(true);
  });

  it("setCachedJson upserts JSON-encoded body with TTL", async () => {
    const upsert = vi.fn<ApiCacheStore["upsert"]>(async () => undefined);
    const cache: Pick<ApiCacheStore, "upsert"> = { upsert };
    const service = new ApiCacheService(cache as ApiCacheStore);

    await service.setCachedJson({
      cacheKey: "projects:c1:a:b",
      resourceType: "projects",
      requestMeta: { clientId: "c1" },
      responseBody: { data: [] },
    });

    expect(upsert).toHaveBeenCalledOnce();
    const arg = upsert.mock.calls[0]?.[0];
    expect(arg?.cacheKey).toBe("projects:c1:a:b");
    expect(arg?.requestMeta).toBe(JSON.stringify({ clientId: "c1" }));
    expect(arg?.responseBody).toBe(JSON.stringify({ data: [] }));
    expect(arg?.expiresAt.getTime()).toBeGreaterThan(arg!.fetchedAt.getTime());
  });
});
