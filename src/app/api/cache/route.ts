import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { apiCache } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const includeBody = searchParams.get("includeBody") === "1";

  const db = getDb();
  const rows = await db
    .select()
    .from(apiCache)
    .orderBy(desc(apiCache.fetchedAt));

  const entries = rows.map((row) => {
    let requestMeta: unknown = row.requestMeta;
    try {
      requestMeta = JSON.parse(row.requestMeta);
    } catch {
      // keep raw string
    }

    const base = {
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

    if (!includeBody) {
      return base;
    }

    let responseBody: unknown = row.responseBody;
    try {
      responseBody = JSON.parse(row.responseBody);
    } catch {
      // keep raw string
    }
    return { ...base, responseBody };
  });

  return Response.json({ entries });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "1";
  const id = searchParams.get("id");

  const db = getDb();

  if (all) {
    await db.delete(apiCache);
    return Response.json({ ok: true, invalidated: "all" });
  }

  if (!id) {
    return Response.json(
      { error: "id query param or all=1 is required" },
      { status: 400 },
    );
  }

  const [row] = await db
    .delete(apiCache)
    .where(eq(apiCache.id, id))
    .returning();

  if (!row) {
    return Response.json({ error: "Cache entry not found" }, { status: 404 });
  }

  return Response.json({ ok: true, invalidated: row.cacheKey });
}
