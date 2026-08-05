import { NextRequest } from "next/server";
import type { WorklogSync } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { parseLimitParam, requireUuidParam } from "@/lib/api";
import { createWorklogSyncService } from "@/services/worklog-sync";

function toClientSync(row: WorklogSync) {
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
    authorAccountId: row.authorAccountId,
    authorDisplayName: row.authorDisplayName,
    appUserId: row.appUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    canRetry:
      Boolean(row.rawPayload) &&
      (row.status === "failed" || row.status === "skipped"),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const limit = parseLimitParam(new URL(request.url).searchParams);
  const service = createWorklogSyncService();
  const rows =
    auth.user.role === "admin"
      ? await service.list(limit)
      : await service.list(limit, auth.user.id);

  return Response.json({ syncs: rows.map(toClientSync) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action !== "retry") {
    return Response.json(
      { error: "Unsupported action. Use action=retry" },
      { status: 400 },
    );
  }

  const idParam = requireUuidParam(searchParams);
  if ("error" in idParam) return idParam.error;

  const service = createWorklogSyncService();
  const existing = await service.findById(idParam.value);

  if (!existing) {
    return Response.json({ error: "Sync not found" }, { status: 404 });
  }

  const isOwner = existing.appUserId === auth.user.id;
  if (auth.user.role !== "admin" && !isOwner) {
    return Response.json(
      { error: "You can only retry your own syncs" },
      { status: 403 },
    );
  }

  const result = await service.retry(idParam.value);
  const row = await service.findById(idParam.value);

  if (result.error === "sync_not_found" || !row) {
    return Response.json({ error: "Sync not found" }, { status: 404 });
  }
  if (result.error === "missing_raw_payload") {
    return Response.json(
      { error: "Cannot retry: stored payload is missing" },
      { status: 400 },
    );
  }
  if (result.error === "retry_not_allowed") {
    return Response.json(
      { error: "Only failed or skipped syncs can be retried" },
      { status: 400 },
    );
  }
  if (result.error === "invalid_stored_payload") {
    return Response.json(
      { error: "Cannot retry: stored payload is invalid JSON" },
      { status: 400 },
    );
  }

  return Response.json({
    result,
    sync: toClientSync(row),
  });
}
