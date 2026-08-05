import { and, desc, eq, gt } from "drizzle-orm";
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
    const rows = await this.db
      .select()
      .from(apiCache)
      .where(and(eq(apiCache.cacheKey, cacheKey), gt(apiCache.expiresAt, now)))
      .limit(1);
    return rows[0] ?? null;
  }

  async list(): Promise<ApiCacheEntry[]> {
    return this.db.select().from(apiCache).orderBy(desc(apiCache.fetchedAt));
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
