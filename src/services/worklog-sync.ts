import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { settings, spaceProjectMappings, worklogSyncs } from "@/db/schema";
import {
  createInternalPmClient,
  type InternalPmClient,
  type TimesheetEntryInput,
} from "@/clients/internal-pm";
import { decryptSecret } from "@/lib/crypto";
import {
  parseWorklogWebhookPayload,
  type ParsedWorklogEvent,
  type WorklogEventType,
} from "@/lib/worklog-parser";
import { hashPayload } from "@/lib/webhook-signature";

export interface SyncResult {
  status: "synced" | "skipped" | "failed";
  eventType?: WorklogEventType;
  jiraWorklogId?: string;
  internalTimesheetId?: string | null;
  error?: string;
  skippedReason?: string;
}

export interface WorklogSyncDeps {
  db: Db;
  pmClient?: InternalPmClient;
  getAccessToken?: () => Promise<string | null>;
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
  if (event.spaceId) {
    const byId = await db
      .select()
      .from(spaceProjectMappings)
      .where(eq(spaceProjectMappings.jiraSpaceId, event.spaceId))
      .limit(1);
    if (byId[0]) return byId[0];
  }
  if (event.spaceKey) {
    const byKey = await db
      .select()
      .from(spaceProjectMappings)
      .where(eq(spaceProjectMappings.jiraSpaceKey, event.spaceKey))
      .limit(1);
    if (byKey[0]) return byKey[0];
  }
  return null;
}

async function recordSync(
  db: Db,
  data: {
    jiraWorklogId: string;
    jiraIssueKey: string | null;
    jiraSpaceId: string | null;
    eventType: WorklogEventType;
    internalTimesheetId: string | null;
    status: "synced" | "skipped" | "failed";
    payloadHash: string;
    error?: string | null;
  },
) {
  await db
    .insert(worklogSyncs)
    .values({
      jiraWorklogId: data.jiraWorklogId,
      jiraIssueKey: data.jiraIssueKey,
      jiraSpaceId: data.jiraSpaceId,
      eventType: data.eventType,
      internalTimesheetId: data.internalTimesheetId,
      status: data.status,
      payloadHash: data.payloadHash,
      error: data.error ?? null,
    })
    .onConflictDoNothing();
}

export async function processWorklogWebhook(
  payload: unknown,
  rawBody: string,
  deps: WorklogSyncDeps,
): Promise<SyncResult> {
  const { db } = deps;
  const payloadHash = hashPayload(rawBody);
  const event = parseWorklogWebhookPayload(payload);

  if (!event) {
    return { status: "skipped", skippedReason: "unsupported_or_invalid_event" };
  }

  try {
    const mapping = await findMapping(db, event);
    if (!mapping || !mapping.enabled) {
      await recordSync(db, {
        jiraWorklogId: event.worklogId,
        jiraIssueKey: event.issueKey,
        jiraSpaceId: event.spaceId,
        eventType: event.eventType,
        internalTimesheetId: null,
        status: "skipped",
        payloadHash,
        error: mapping ? "mapping_disabled" : "no_mapping",
      });
      return {
        status: "skipped",
        eventType: event.eventType,
        jiraWorklogId: event.worklogId,
        skippedReason: mapping ? "mapping_disabled" : "no_mapping",
      };
    }

    let pm = deps.pmClient;
    if (!pm) {
      const token =
        (await (deps.getAccessToken?.() ?? resolveAccessToken(db))) ?? "";
      pm = createInternalPmClient({
        accessToken: token,
        baseUrl: process.env.INTERNAL_PM_BASE_URL,
      });
    }

    const input: TimesheetEntryInput = {
      internalProjectId: mapping.internalProjectId,
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
        await recordSync(db, {
          jiraWorklogId: event.worklogId,
          jiraIssueKey: event.issueKey,
          jiraSpaceId: event.spaceId,
          eventType: event.eventType,
          internalTimesheetId: null,
          status: "skipped",
          payloadHash,
          error: "no_prior_timesheet",
        });
        return {
          status: "skipped",
          eventType: event.eventType,
          jiraWorklogId: event.worklogId,
          skippedReason: "no_prior_timesheet",
        };
      }
    }

    await recordSync(db, {
      jiraWorklogId: event.worklogId,
      jiraIssueKey: event.issueKey,
      jiraSpaceId: event.spaceId,
      eventType: event.eventType,
      internalTimesheetId,
      status: "synced",
      payloadHash,
    });

    return {
      status: "synced",
      eventType: event.eventType,
      jiraWorklogId: event.worklogId,
      internalTimesheetId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    try {
      await recordSync(db, {
        jiraWorklogId: event.worklogId,
        jiraIssueKey: event.issueKey,
        jiraSpaceId: event.spaceId,
        eventType: event.eventType,
        internalTimesheetId: null,
        status: "failed",
        payloadHash,
        error: message,
      });
    } catch (recordErr) {
      console.error("[worklog-sync] Failed to record failure", recordErr);
    }
    return {
      status: "failed",
      eventType: event.eventType,
      jiraWorklogId: event.worklogId,
      error: message,
    };
  }
}
