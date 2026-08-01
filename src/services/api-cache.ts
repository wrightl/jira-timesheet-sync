import { and, eq, gt } from "drizzle-orm";
import type { Db } from "@/db";
import { apiCache } from "@/db/schema";

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

export async function getCachedJson<T>(
  db: Db,
  cacheKey: string,
): Promise<T | null> {
  const now = new Date();
  const rows = await db
    .select()
    .from(apiCache)
    .where(and(eq(apiCache.cacheKey, cacheKey), gt(apiCache.expiresAt, now)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  try {
    return JSON.parse(row.responseBody) as T;
  } catch {
    return null;
  }
}

export async function setCachedJson(
  db: Db,
  data: {
    cacheKey: string;
    resourceType: ApiCacheResourceType;
    requestMeta: Record<string, unknown>;
    responseBody: unknown;
  },
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
  const responseBody = JSON.stringify(data.responseBody);
  const requestMeta = JSON.stringify(data.requestMeta);

  await db
    .insert(apiCache)
    .values({
      cacheKey: data.cacheKey,
      resourceType: data.resourceType,
      requestMeta,
      responseBody,
      fetchedAt: now,
      expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: apiCache.cacheKey,
      set: {
        resourceType: data.resourceType,
        requestMeta,
        responseBody,
        fetchedAt: now,
        expiresAt,
        updatedAt: now,
      },
    });
}
