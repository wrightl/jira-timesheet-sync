import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { worklogSyncs } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { retryWorklogSync } from "@/services/worklog-sync";

function toClientSync(row: typeof worklogSyncs.$inferSelect) {
  return {
    id: row.id,
    jiraWorklogId: row.jiraWorklogId,
    jiraIssueKey: row.jiraIssueKey,
    jiraSpaceId: row.jiraSpaceId,
    eventType: row.eventType,
    status: row.status,
    internalTimesheetId: row.internalTimesheetId,
    error: row.error,
    payloadHash: row.payloadHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    canRetry:
      Boolean(row.rawPayload) &&
      (row.status === "failed" || row.status === "skipped"),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const limitParam = new URL(request.url).searchParams.get("limit");
  const limit = Math.min(Number(limitParam) || 20, 100);

  const db = getDb();
  const rows = await db
    .select()
    .from(worklogSyncs)
    .orderBy(desc(worklogSyncs.createdAt))
    .limit(limit);

  return NextResponse.json({ syncs: rows.map(toClientSync) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const id = searchParams.get("id");

  if (action !== "retry") {
    return NextResponse.json(
      { error: "Unsupported action. Use action=retry" },
      { status: 400 },
    );
  }
  if (!id) {
    return NextResponse.json(
      { error: "id query param is required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const result = await retryWorklogSync(id, { db });

  const rows = await db
    .select()
    .from(worklogSyncs)
    .where(eq(worklogSyncs.id, id))
    .limit(1);

  if (result.error === "sync_not_found" || !rows[0]) {
    return NextResponse.json({ error: "Sync not found" }, { status: 404 });
  }
  if (result.error === "missing_raw_payload") {
    return NextResponse.json(
      { error: "Cannot retry: stored payload is missing" },
      { status: 400 },
    );
  }
  if (result.error === "retry_not_allowed") {
    return NextResponse.json(
      { error: "Only failed or skipped syncs can be retried" },
      { status: 400 },
    );
  }
  if (result.error === "invalid_stored_payload") {
    return NextResponse.json(
      { error: "Cannot retry: stored payload is invalid JSON" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    result,
    sync: toClientSync(rows[0]),
  });
}
