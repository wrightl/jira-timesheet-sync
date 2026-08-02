import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { settings, spaceProjectMappings, worklogSyncs } from "@/db/schema";
import type { InternalPmClient, TimesheetEntryInput } from "@/clients/internal-pm";
import { decryptSecret } from "@/lib/crypto";
import {
  parseWorklogWebhookPayload,
  type ParsedWorklogEvent,
  type WorklogEventType,
} from "@/lib/worklog-parser";
import { hashPayload } from "@/lib/webhook-auth";
import { createResolvingPmClient } from "@/services/bitmap-resolver";

export type SyncStatus = "pending" | "synced" | "skipped" | "failed";

export interface SyncResult {
  status: SyncStatus;
  eventType?: WorklogEventType;
  jiraWorklogId?: string;
  internalTimesheetId?: string | null;
  error?: string;
  skippedReason?: string;
  syncId?: string;
}

export interface WorklogSyncDeps {
  db: Db;
  pmClient?: InternalPmClient;
  getAccessToken?: () => Promise<string | null>;
  /** When set, finalize by updating this row instead of inserting. */
  syncId?: string;
}

export interface AcceptResult {
  syncId: string | null;
  shouldProcess: boolean;
  duplicate: boolean;
  eventType?: WorklogEventType;
  jiraWorklogId?: string;
  reason?: string;
}

async function resolveAccessToken(db: Db): Promise<string | null> {
  const encryptionKey = process.env.SETTINGS_ENCRYPTION_KEY;
  try {
    const rows = await db
      .select()
      .from(settings)
      .where(eq(settings.id, "default"))
      .limit(1);
    const encrypted = rows[0]?.internalPmAccessTokenEncrypted;
    if (encrypted && encryptionKey) {
      return decryptSecret(encrypted, encryptionKey);
    }
  } catch (err) {
    console.warn("[worklog-sync] Failed to read token from settings", err);
  }
  return process.env.INTERNAL_PM_ACCESS_TOKEN || null;
}

async function findLatestTimesheetId(
  db: Db,
  jiraWorklogId: string,
): Promise<string | null> {
  const rows = await db
    .select()
    .from(worklogSyncs)
    .where(
      and(
        eq(worklogSyncs.jiraWorklogId, jiraWorklogId),
        eq(worklogSyncs.status, "synced"),
      ),
    )
    .orderBy(desc(worklogSyncs.createdAt))
    .limit(1);
  return rows[0]?.internalTimesheetId ?? null;
}

async function findMapping(db: Db, event: ParsedWorklogEvent) {
  if (!event.spaceKey) {
    return null;
  }
  const rows = await db
    .select()
    .from(spaceProjectMappings)
    .where(eq(spaceProjectMappings.jiraSpaceKey, event.spaceKey))
    .limit(1);
  return rows[0] ?? null;
}

async function findByPayloadHash(
  db: Db,
  jiraWorklogId: string,
  eventType: WorklogEventType,
  payloadHash: string,
) {
  const rows = await db
    .select()
    .from(worklogSyncs)
    .where(
      and(
        eq(worklogSyncs.jiraWorklogId, jiraWorklogId),
        eq(worklogSyncs.eventType, eventType),
        eq(worklogSyncs.payloadHash, payloadHash),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function finalizeSync(
  db: Db,
  syncId: string | undefined,
  data: {
    jiraWorklogId: string;
    jiraIssueKey: string | null;
    jiraSpaceId: string | null;
    eventType: WorklogEventType;
    internalTimesheetId: string | null;
    status: SyncStatus;
    payloadHash: string;
    rawPayload?: string | null;
    error?: string | null;
  },
): Promise<string | undefined> {
  if (syncId) {
    await db
      .update(worklogSyncs)
      .set({
        jiraIssueKey: data.jiraIssueKey,
        jiraSpaceId: data.jiraSpaceId,
        internalTimesheetId: data.internalTimesheetId,
        status: data.status,
        error: data.error ?? null,
        updatedAt: new Date(),
      })
      .where(eq(worklogSyncs.id, syncId));
    return syncId;
  }

  const [row] = await db
    .insert(worklogSyncs)
    .values({
      jiraWorklogId: data.jiraWorklogId,
      jiraIssueKey: data.jiraIssueKey,
      jiraSpaceId: data.jiraSpaceId,
      eventType: data.eventType,
      internalTimesheetId: data.internalTimesheetId,
      status: data.status,
      payloadHash: data.payloadHash,
      rawPayload: data.rawPayload ?? null,
      error: data.error ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: worklogSyncs.id });

  return row?.id;
}

/**
 * Persist a pending sync row and decide whether background processing should run.
 */
export async function acceptWorklogWebhook(
  payload: unknown,
  rawBody: string,
  db: Db,
): Promise<AcceptResult> {
  const payloadHash = hashPayload(rawBody);
  const event = parseWorklogWebhookPayload(payload);

  if (!event) {
    return {
      syncId: null,
      shouldProcess: false,
      duplicate: false,
      reason: "unsupported_or_invalid_event",
    };
  }

  const existing = await findByPayloadHash(
    db,
    event.worklogId,
    event.eventType,
    payloadHash,
  );

  if (existing) {
    return {
      syncId: existing.id,
      shouldProcess: false,
      duplicate: true,
      eventType: event.eventType,
      jiraWorklogId: event.worklogId,
      reason: `already_${existing.status}`,
    };
  }

  const [row] = await db
    .insert(worklogSyncs)
    .values({
      jiraWorklogId: event.worklogId,
      jiraIssueKey: event.issueKey,
      jiraSpaceId: event.spaceId,
      eventType: event.eventType,
      internalTimesheetId: null,
      status: "pending",
      payloadHash,
      rawPayload: rawBody,
      error: null,
    })
    .onConflictDoNothing()
    .returning({ id: worklogSyncs.id });

  if (!row) {
    const raced = await findByPayloadHash(
      db,
      event.worklogId,
      event.eventType,
      payloadHash,
    );
    return {
      syncId: raced?.id ?? null,
      shouldProcess: false,
      duplicate: true,
      eventType: event.eventType,
      jiraWorklogId: event.worklogId,
      reason: "duplicate_race",
    };
  }

  return {
    syncId: row.id,
    shouldProcess: true,
    duplicate: false,
    eventType: event.eventType,
    jiraWorklogId: event.worklogId,
  };
}

export async function processWorklogWebhook(
  payload: unknown,
  rawBody: string,
  deps: WorklogSyncDeps,
): Promise<SyncResult> {
  const { db, syncId } = deps;
  const payloadHash = hashPayload(rawBody);
  const event = parseWorklogWebhookPayload(payload);

  if (!event) {
    return { status: "skipped", skippedReason: "unsupported_or_invalid_event" };
  }

  try {
    const mapping = await findMapping(db, event);
    if (!mapping || !mapping.enabled) {
      const id = await finalizeSync(db, syncId, {
        jiraWorklogId: event.worklogId,
        jiraIssueKey: event.issueKey,
        jiraSpaceId: event.spaceId,
        eventType: event.eventType,
        internalTimesheetId: null,
        status: "skipped",
        payloadHash,
        rawPayload: rawBody,
        error: mapping ? "mapping_disabled" : "no_mapping",
      });
      return {
        status: "skipped",
        eventType: event.eventType,
        jiraWorklogId: event.worklogId,
        skippedReason: mapping ? "mapping_disabled" : "no_mapping",
        syncId: id,
      };
    }

    let pm = deps.pmClient;
    if (!pm) {
      const token =
        (await (deps.getAccessToken?.() ?? resolveAccessToken(db))) ?? "";
      pm = createResolvingPmClient({
        db,
        accessToken: token,
        baseUrl: process.env.INTERNAL_PM_BASE_URL,
      });
    }

    const input: TimesheetEntryInput = {
      clientId: mapping.clientId,
      jiraSpaceKey: event.spaceKey,
      jiraWorklogId: event.worklogId,
      jiraIssueKey: event.issueKey,
      authorAccountId: event.authorAccountId,
      authorDisplayName: event.authorDisplayName,
      timeSpentSeconds: event.timeSpentSeconds,
      started: event.started,
      comment: event.comment,
    };

    let internalTimesheetId: string | null = null;

    if (event.eventType === "worklog_created") {
      const result = await pm.createTimesheet(input);
      internalTimesheetId = result.timesheetId;
    } else if (event.eventType === "worklog_updated") {
      const existingId = await findLatestTimesheetId(db, event.worklogId);
      if (existingId) {
        const result = await pm.updateTimesheet(existingId, input);
        internalTimesheetId = result.timesheetId;
      } else {
        const result = await pm.createTimesheet(input);
        internalTimesheetId = result.timesheetId;
      }
    } else {
      const existingId = await findLatestTimesheetId(db, event.worklogId);
      if (existingId) {
        await pm.deleteTimesheet(existingId);
        internalTimesheetId = existingId;
      } else {
        const id = await finalizeSync(db, syncId, {
          jiraWorklogId: event.worklogId,
          jiraIssueKey: event.issueKey,
          jiraSpaceId: event.spaceId,
          eventType: event.eventType,
          internalTimesheetId: null,
          status: "skipped",
          payloadHash,
          rawPayload: rawBody,
          error: "no_prior_timesheet",
        });
        return {
          status: "skipped",
          eventType: event.eventType,
          jiraWorklogId: event.worklogId,
          skippedReason: "no_prior_timesheet",
          syncId: id,
        };
      }
    }

    const id = await finalizeSync(db, syncId, {
      jiraWorklogId: event.worklogId,
      jiraIssueKey: event.issueKey,
      jiraSpaceId: event.spaceId,
      eventType: event.eventType,
      internalTimesheetId,
      status: "synced",
      payloadHash,
      rawPayload: rawBody,
    });

    return {
      status: "synced",
      eventType: event.eventType,
      jiraWorklogId: event.worklogId,
      internalTimesheetId,
      syncId: id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    try {
      const id = await finalizeSync(db, syncId, {
        jiraWorklogId: event.worklogId,
        jiraIssueKey: event.issueKey,
        jiraSpaceId: event.spaceId,
        eventType: event.eventType,
        internalTimesheetId: null,
        status: "failed",
        payloadHash,
        rawPayload: rawBody,
        error: message,
      });
      return {
        status: "failed",
        eventType: event.eventType,
        jiraWorklogId: event.worklogId,
        error: message,
        syncId: id,
      };
    } catch (recordErr) {
      console.error("[worklog-sync] Failed to record failure", recordErr);
      return {
        status: "failed",
        eventType: event.eventType,
        jiraWorklogId: event.worklogId,
        error: message,
        syncId,
      };
    }
  }
}

export async function retryWorklogSync(
  syncId: string,
  deps: Omit<WorklogSyncDeps, "syncId">,
): Promise<SyncResult> {
  const { db } = deps;
  const rows = await db
    .select()
    .from(worklogSyncs)
    .where(eq(worklogSyncs.id, syncId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return { status: "failed", error: "sync_not_found", syncId };
  }
  if (!row.rawPayload) {
    return {
      status: "failed",
      error: "missing_raw_payload",
      syncId,
      eventType: row.eventType,
      jiraWorklogId: row.jiraWorklogId,
    };
  }
  if (row.status !== "failed" && row.status !== "skipped") {
    return {
      status: "failed",
      error: "retry_not_allowed",
      syncId,
      eventType: row.eventType,
      jiraWorklogId: row.jiraWorklogId,
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(row.rawPayload);
  } catch {
    return {
      status: "failed",
      error: "invalid_stored_payload",
      syncId,
      eventType: row.eventType,
      jiraWorklogId: row.jiraWorklogId,
    };
  }

  await db
    .update(worklogSyncs)
    .set({
      status: "pending",
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(worklogSyncs.id, syncId));

  return processWorklogWebhook(payload, row.rawPayload, {
    ...deps,
    syncId,
  });
}
