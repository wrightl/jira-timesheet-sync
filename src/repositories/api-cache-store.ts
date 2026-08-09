import type { ApiCacheEntry, NewApiCacheEntry } from "@/db/schema";

/**
 * Backend-agnostic store for API response cache entries.
 * Implemented by the DB repository and the Vercel Runtime Cache store.
 */
export type ApiCacheStore = {
  getValidByKey(cacheKey: string): Promise<ApiCacheEntry | null>;
  list(): Promise<ApiCacheEntry[]>;
  deleteExpired(now?: Date): Promise<number>;
  upsert(
    values: Omit<NewApiCacheEntry, "id" | "createdAt"> & {
      updatedAt?: Date;
    },
  ): Promise<void>;
  deleteById(id: string): Promise<ApiCacheEntry | null>;
  deleteByKey(cacheKey: string): Promise<ApiCacheEntry | null>;
  deleteAll(): Promise<void>;
};
