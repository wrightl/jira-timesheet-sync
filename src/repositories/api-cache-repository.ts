import { and, desc, eq, gt, lte } from "drizzle-orm";
import type { Db } from "@/db";
import {
  apiCache,
  type ApiCacheEntry,
  type NewApiCacheEntry,
} from "@/db/schema";

export class ApiCacheRepository {
  constructor(private readonly db: Db) {}

  async getValidByKey(cacheKey: string): Promise<ApiCacheEntry | null> {
    const now = new Date();
    await this.deleteExpired(now);
    const rows = await this.db
      .select()
      .from(apiCache)
      .where(and(eq(apiCache.cacheKey, cacheKey), gt(apiCache.expiresAt, now)))
      .limit(1);
    return rows[0] ?? null;
  }

  async list(): Promise<ApiCacheEntry[]> {
    await this.deleteExpired();
    return this.db.select().from(apiCache).orderBy(desc(apiCache.fetchedAt));
  }

  /** Remove rows whose expires_at is at or before `now` (defaults to current time). */
  async deleteExpired(now: Date = new Date()): Promise<number> {
    const deleted = await this.db
      .delete(apiCache)
      .where(lte(apiCache.expiresAt, now))
      .returning({ id: apiCache.id });
    return deleted.length;
  }

  async upsert(
    values: Omit<NewApiCacheEntry, "id" | "createdAt"> & {
      updatedAt?: Date;
    },
  ): Promise<void> {
    const now = values.updatedAt ?? new Date();
    await this.db
      .insert(apiCache)
      .values({
        cacheKey: values.cacheKey,
        resourceType: values.resourceType,
        requestMeta: values.requestMeta,
        responseBody: values.responseBody,
        fetchedAt: values.fetchedAt,
        expiresAt: values.expiresAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: apiCache.cacheKey,
        set: {
          resourceType: values.resourceType,
          requestMeta: values.requestMeta,
          responseBody: values.responseBody,
          fetchedAt: values.fetchedAt,
          expiresAt: values.expiresAt,
          updatedAt: now,
        },
      });
  }

  async deleteById(id: string): Promise<ApiCacheEntry | null> {
    const [row] = await this.db
      .delete(apiCache)
      .where(eq(apiCache.id, id))
      .returning();
    return row ?? null;
  }

  async deleteAll(): Promise<void> {
    await this.db.delete(apiCache);
  }
}
