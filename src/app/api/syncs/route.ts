import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { worklogSyncs } from "@/db/schema";
import { requireAdminAuth } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const limitParam = new URL(request.url).searchParams.get("limit");
  const limit = Math.min(Number(limitParam) || 20, 100);

  const db = getDb();
  const rows = await db
    .select()
    .from(worklogSyncs)
    .orderBy(desc(worklogSyncs.createdAt))
    .limit(limit);

  return Response.json({ syncs: rows });
}
