import { describe, expect, it, vi } from "vitest";
import { ApiCacheService } from "@/services/api-cache";
import type { ApiCacheRepository } from "@/repositories/api-cache-repository";
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

describe("ApiCacheService", () => {
  it("getCachedJson returns parsed JSON for a valid entry", async () => {
    const entry = makeEntry({ cacheKey: "projects:c1:a:b" });
    const cache: Pick<ApiCacheRepository, "getValidByKey"> = {
      getValidByKey: vi.fn(async () => entry),
    };
    const service = new ApiCacheService(cache as ApiCacheRepository);
    await expect(
      service.getCachedJson<{ ok: boolean }>(entry.cacheKey),
    ).resolves.toEqual({ ok: true });
  });

  it("list marks entries past expiresAt as expired", async () => {
    const expired = makeEntry({
      cacheKey: "projects:old",
      expiresAt: new Date(Date.now() - 1_000),
    });
    const cache: Pick<ApiCacheRepository, "list"> = {
      list: vi.fn(async () => [expired]),
    };
    const service = new ApiCacheService(cache as ApiCacheRepository);
    const entries = await service.list(false);
    expect(entries[0]?.expired).toBe(true);
  });
});
