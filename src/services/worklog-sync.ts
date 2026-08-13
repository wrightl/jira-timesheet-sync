import type { Db } from "@/db";
import { getDb } from "@/db";
import type { InternalPmClient, TimesheetEntryInput } from "@/clients/bitmap-http";
import { WorklogSyncsRepository } from "@/repositories/worklog-syncs-repository";
import { SpaceProjectMappingsRepository } from "@/repositories/space-project-mappings-repository";
import { UsersRepository } from "@/repositories/users-repository";
import {
  createBitmapResolverService,
  formatTimesheetDate,
  type BitmapResolverService,
} from "@/services/bitmap-resolver";
import { createSettingsService, type SettingsService } from "@/services/settings-service";
import {
  createSpaceMappingDiscoveryService,
  type SpaceMappingDiscoveryService,
} from "@/services/space-mapping-discovery";
import {
  createSyncAttributionService,
  type SyncAttributionService,
} from "@/lib/sync-attribution";
import {
  parseWorklogWebhookPayload,
  type ParsedWorklogEvent,
  type WorklogEventType,
} from "@/lib/worklog-parser";
import type {
  SyncListSort,
  SyncListSortDir,
} from "@/lib/sync-list-filters";
import { hashPayload } from "@/lib/webhook-auth";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";

export type SyncStatus =
  | "pending"
  | "processing"
  | "synced"
  | "skipped"
  | "failed";

/** Format notes sent to Bitmap as HTML: issue key, plus worklog comment when present. */
export function formatTimesheetComment(
  issueKey: string | null,
  comment: string | null,
): string {
  const header = `<p>${escapeHtml(issueKey ?? "")}:</p>`;
  if (!comment) {
    return header;
  }

  const items = comment
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  if (!items) {
    return header;
  }

  return `${header}<ul>${items}</ul>`;
}

/** Extract worklog.started from a previously stored webhook rawPayload. */
export function priorStartedFromRawPayload(
  rawPayload: string | null | undefined,
): string | null {
  if (!rawPayload) return null;
  try {
    const parsed = JSON.parse(rawPayload) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const worklog = (parsed as Record<string, unknown>).worklog;
    if (!worklog || typeof worklog !== "object") return null;
    const started = (worklog as Record<string, unknown>).started;
    return typeof started === "string" && started.length > 0 ? started : null;
  } catch {
    return null;
  }
}

function timesheetDateChanged(
  priorStarted: string | null,
  nextStarted: string | null,
): boolean {
  if (!priorStarted || !nextStarted) return false;
  try {
    return formatTimesheetDate(priorStarted) !== formatTimesheetDate(nextStarted);
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface SyncResult {
  status: SyncStatus;
  eventType?: WorklogEventType;
  jiraWorklogId?: string;
  internalTimesheetId?: string | null;
  error?: string;
  skippedReason?: string;
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

export interface WorklogSyncServiceDeps {
  syncs: WorklogSyncsRepository;
  spaceMappings: SpaceProjectMappingsRepository;
  users: UsersRepository;
  attribution: SyncAttributionService;
  settings: SettingsService;
  resolver: BitmapResolverService;
  spaceMappingDiscovery?: SpaceMappingDiscoveryService;
  pmClient?: InternalPmClient;
  getAccessToken?: () => Promise<string | null>;
}

export class WorklogSyncService {
  constructor(private readonly deps: WorklogSyncServiceDeps) {}

  private async findMapping(event: ParsedWorklogEvent) {
    if (!event.spaceKey) return null;
    const existing = await this.deps.spaceMappings.findBySpaceKey(
      event.spaceKey,
    );
    if (existing) return existing;

    if (!this.deps.spaceMappingDiscovery) return null;
    return this.deps.spaceMappingDiscovery.ensureMappingForSpaceKey(
      event.spaceKey,
    );
  }

  async accept(
    payload: unknown,
    rawBody: string,
  ): Promise<AcceptResult> {
    await this.deps.syncs.reclaimStalePending();

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

    const existing = await this.deps.syncs.findByPayloadHash(
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

    const appUserId = await this.deps.attribution.ensureAppUserIdForAuthor(
      event.authorDisplayName,
    );

    const row = await this.deps.syncs.insertPending({
      jiraWorklogId: event.worklogId,
      jiraIssueKey: event.issueKey,
      jiraSpaceId: event.spaceId,
      eventType: event.eventType,
      internalTimesheetId: null,
      status: "pending",
      payloadHash,
      rawPayload: rawBody,
      error: null,
      authorAccountId: event.authorAccountId,
      authorDisplayName: event.authorDisplayName,
      appUserId,
    });

    if (!row) {
      const raced = await this.deps.syncs.findByPayloadHash(
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

  async process(
    payload: unknown,
    rawBody: string,
    syncId?: string,
  ): Promise<SyncResult> {
    const payloadHash = hashPayload(rawBody);
    const event = parseWorklogWebhookPayload(payload);

    if (!event) {
      return { status: "skipped", skippedReason: "unsupported_or_invalid_event" };
    }

    if (syncId) {
      const claimed = await this.deps.syncs.claimForProcess(syncId);
      if (!claimed) {
        return {
          status: "failed",
          error: "process_not_claimed",
          eventType: event.eventType,
          jiraWorklogId: event.worklogId,
          syncId,
        };
      }
    }

    let appUserId = await this.deps.attribution.ensureAppUserIdForAuthor(
      event.authorDisplayName,
    );
    const identity = () => ({
      authorAccountId: event.authorAccountId,
      authorDisplayName: event.authorDisplayName,
      appUserId,
    });

    log.info("worklog-sync", "process_start", {
      syncId: syncId ?? null,
      eventType: event.eventType,
      worklogId: event.worklogId,
      issueKey: event.issueKey,
      spaceKey: event.spaceKey,
      spaceId: event.spaceId,
      authorDisplayName: event.authorDisplayName,
      appUserId,
    });

    try {
      if (appUserId) {
        const syncEnabled = await this.deps.users.isSyncEnabled(appUserId);
        if (syncEnabled === false) {
          log.warn("worklog-sync", "user_sync_disabled", {
            reason: "user_sync_disabled",
            appUserId,
            authorDisplayName: event.authorDisplayName,
            worklogId: event.worklogId,
            issueKey: event.issueKey,
            eventType: event.eventType,
            syncId: syncId ?? null,
          });
          const id = await this.deps.syncs.finalise(syncId, {
            jiraWorklogId: event.worklogId,
            jiraIssueKey: event.issueKey,
            jiraSpaceId: event.spaceId,
            eventType: event.eventType,
            internalTimesheetId: null,
            status: "skipped",
            payloadHash,
            rawPayload: rawBody,
            error: "user_sync_disabled",
            ...identity(),
          });
          return {
            status: "skipped",
            eventType: event.eventType,
            jiraWorklogId: event.worklogId,
            skippedReason: "user_sync_disabled",
            syncId: id,
          };
        }
      }

      const mapping = await this.findMapping(event);
      if (!mapping || !mapping.enabled) {
        const reason = !event.spaceKey
          ? "missing_space_key"
          : mapping
            ? "mapping_disabled"
            : "no_mapping";
        log.warn("worklog-sync", reason, {
          reason,
          spaceKey: event.spaceKey,
          spaceId: event.spaceId,
          issueKey: event.issueKey,
          worklogId: event.worklogId,
          eventType: event.eventType,
          authorDisplayName: event.authorDisplayName,
          syncId: syncId ?? null,
        });
        appUserId = await this.deps.attribution.ensureAppUserIdForAuthor(
          event.authorDisplayName,
        );
        const id = await this.deps.syncs.finalise(syncId, {
          jiraWorklogId: event.worklogId,
          jiraIssueKey: event.issueKey,
          jiraSpaceId: event.spaceId,
          eventType: event.eventType,
          internalTimesheetId: null,
          status: "skipped",
          payloadHash,
          rawPayload: rawBody,
          error: mapping ? "mapping_disabled" : "no_mapping",
          ...identity(),
        });
        return {
          status: "skipped",
          eventType: event.eventType,
          jiraWorklogId: event.worklogId,
          skippedReason: mapping ? "mapping_disabled" : "no_mapping",
          syncId: id,
        };
      }

      let pm = this.deps.pmClient;
      if (!pm) {
        const token =
          (await (this.deps.getAccessToken?.() ??
            this.deps.settings.getAccessToken())) ?? "";
        pm = this.deps.resolver.createResolvingPmClient({
          accessToken: token,
          baseUrl: getEnv().INTERNAL_PM_BASE_URL,
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
        comment: formatTimesheetComment(event.issueKey, event.comment),
      };

      let internalTimesheetId: string | null = null;

      if (event.eventType === "worklog_created") {
        const result = await pm.createTimesheet(input);
        internalTimesheetId = result.timesheetId;
      } else if (event.eventType === "worklog_updated") {
        const prior = await this.deps.syncs.findLatestSyncedTimesheet(
          event.worklogId,
        );
        if (prior) {
          const priorStarted = priorStartedFromRawPayload(prior.rawPayload);
          if (timesheetDateChanged(priorStarted, event.started)) {
            await pm.deleteTimesheet(prior.timesheetId);
            const result = await pm.createTimesheet(input);
            internalTimesheetId = result.timesheetId;
          } else {
            const result = await pm.updateTimesheet(prior.timesheetId, input);
            internalTimesheetId = result.timesheetId;
          }
        } else {
          const result = await pm.createTimesheet(input);
          internalTimesheetId = result.timesheetId;
        }
      } else {
        const existingId = await this.deps.syncs.findLatestSyncedTimesheetId(
          event.worklogId,
        );
        if (existingId) {
          await pm.deleteTimesheet(existingId);
          internalTimesheetId = existingId;
        } else {
          log.warn("worklog-sync", "no_prior_timesheet", {
            reason: "no_prior_timesheet",
            worklogId: event.worklogId,
            issueKey: event.issueKey,
            spaceKey: event.spaceKey,
            eventType: event.eventType,
            authorDisplayName: event.authorDisplayName,
            syncId: syncId ?? null,
          });
          appUserId = await this.deps.attribution.ensureAppUserIdForAuthor(
            event.authorDisplayName,
          );
          const id = await this.deps.syncs.finalise(syncId, {
            jiraWorklogId: event.worklogId,
            jiraIssueKey: event.issueKey,
            jiraSpaceId: event.spaceId,
            eventType: event.eventType,
            internalTimesheetId: null,
            status: "skipped",
            payloadHash,
            rawPayload: rawBody,
            error: "no_prior_timesheet",
            ...identity(),
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

      // Re-attribute after resolver may have created mapping + provisioned user.
      appUserId = await this.deps.attribution.ensureAppUserIdForAuthor(
        event.authorDisplayName,
      );

      const id = await this.deps.syncs.finalise(syncId, {
        jiraWorklogId: event.worklogId,
        jiraIssueKey: event.issueKey,
        jiraSpaceId: event.spaceId,
        eventType: event.eventType,
        internalTimesheetId,
        status: "synced",
        payloadHash,
        rawPayload: rawBody,
        ...identity(),
      });

      log.info("worklog-sync", "synced", {
        syncId: id,
        eventType: event.eventType,
        worklogId: event.worklogId,
        issueKey: event.issueKey,
        spaceKey: event.spaceKey,
        internalTimesheetId,
        authorDisplayName: event.authorDisplayName,
        appUserId,
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
      appUserId = await this.deps.attribution.ensureAppUserIdForAuthor(
        event.authorDisplayName,
      );
      log.error("worklog-sync", err, {
        phase: "process",
        syncId: syncId ?? null,
        eventType: event.eventType,
        worklogId: event.worklogId,
        issueKey: event.issueKey,
        spaceKey: event.spaceKey,
        spaceId: event.spaceId,
        authorDisplayName: event.authorDisplayName,
        appUserId,
      });
      try {
        const id = await this.deps.syncs.finalise(syncId, {
          jiraWorklogId: event.worklogId,
          jiraIssueKey: event.issueKey,
          jiraSpaceId: event.spaceId,
          eventType: event.eventType,
          internalTimesheetId: null,
          status: "failed",
          payloadHash,
          rawPayload: rawBody,
          error: message,
          ...identity(),
        });
        return {
          status: "failed",
          eventType: event.eventType,
          jiraWorklogId: event.worklogId,
          error: message,
          syncId: id,
        };
      } catch (recordErr) {
        log.error("worklog-sync", recordErr, { phase: "record_failure" });
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

  async retry(syncId: string): Promise<SyncResult> {
    const claimed = await this.deps.syncs.claimForRetry(syncId);
    if (!claimed) {
      const row = await this.deps.syncs.findById(syncId);
      if (!row) {
        return { status: "failed", error: "sync_not_found", syncId };
      }
      return {
        status: "failed",
        error: "retry_not_allowed",
        syncId,
        eventType: row.eventType,
        jiraWorklogId: row.jiraWorklogId,
      };
    }

    if (!claimed.rawPayload) {
      await this.deps.syncs.finalise(syncId, {
        jiraWorklogId: claimed.jiraWorklogId,
        jiraIssueKey: claimed.jiraIssueKey,
        jiraSpaceId: claimed.jiraSpaceId,
        eventType: claimed.eventType,
        internalTimesheetId: claimed.internalTimesheetId,
        status: "failed",
        payloadHash: claimed.payloadHash,
        rawPayload: claimed.rawPayload,
        error: "missing_raw_payload",
        authorAccountId: claimed.authorAccountId,
        authorDisplayName: claimed.authorDisplayName,
        appUserId: claimed.appUserId,
      });
      return {
        status: "failed",
        error: "missing_raw_payload",
        syncId,
        eventType: claimed.eventType,
        jiraWorklogId: claimed.jiraWorklogId,
      };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(claimed.rawPayload);
    } catch {
      await this.deps.syncs.finalise(syncId, {
        jiraWorklogId: claimed.jiraWorklogId,
        jiraIssueKey: claimed.jiraIssueKey,
        jiraSpaceId: claimed.jiraSpaceId,
        eventType: claimed.eventType,
        internalTimesheetId: claimed.internalTimesheetId,
        status: "failed",
        payloadHash: claimed.payloadHash,
        rawPayload: claimed.rawPayload,
        error: "invalid_stored_payload",
        authorAccountId: claimed.authorAccountId,
        authorDisplayName: claimed.authorDisplayName,
        appUserId: claimed.appUserId,
      });
      return {
        status: "failed",
        error: "invalid_stored_payload",
        syncId,
        eventType: claimed.eventType,
        jiraWorklogId: claimed.jiraWorklogId,
      };
    }

    return this.process(payload, claimed.rawPayload, syncId);
  }

  async list(
    opts: {
      limit: number;
      offset: number;
      appUserId?: string;
      status?: SyncStatus;
      eventType?: WorklogEventType;
      issueKey?: string;
      since?: Date;
      sort?: SyncListSort;
      dir?: SyncListSortDir;
    },
  ) {
    return this.deps.syncs.list(opts);
  }

  async findById(id: string) {
    return this.deps.syncs.findById(id);
  }
}

export function createWorklogSyncService(
  db: Db = getDb(),
  overrides?: Partial<WorklogSyncServiceDeps>,
) {
  const syncs = overrides?.syncs ?? new WorklogSyncsRepository(db);
  const spaceMappings =
    overrides?.spaceMappings ?? new SpaceProjectMappingsRepository(db);
  const attribution =
    overrides?.attribution ?? createSyncAttributionService(db);
  const settings = overrides?.settings ?? createSettingsService(db);
  const resolver = overrides?.resolver ?? createBitmapResolverService(db);
  const users = overrides?.users ?? new UsersRepository(db);
  const spaceMappingDiscovery =
    overrides?.spaceMappingDiscovery ??
    createSpaceMappingDiscoveryService(db);

  return new WorklogSyncService({
    syncs,
    spaceMappings,
    users,
    attribution,
    settings,
    resolver,
    spaceMappingDiscovery,
    pmClient: overrides?.pmClient,
    getAccessToken: overrides?.getAccessToken,
  });
}

/** @deprecated Prefer WorklogSyncService.accept */
export async function acceptWorklogWebhook(
  payload: unknown,
  rawBody: string,
  db: Db,
): Promise<AcceptResult> {
  return createWorklogSyncService(db).accept(payload, rawBody);
}

/** @deprecated Prefer WorklogSyncService.process */
export async function processWorklogWebhook(
  payload: unknown,
  rawBody: string,
  deps: {
    db: Db;
    pmClient?: InternalPmClient;
    getAccessToken?: () => Promise<string | null>;
    syncId?: string;
    spaceMappingDiscovery?: SpaceMappingDiscoveryService;
  },
): Promise<SyncResult> {
  return createWorklogSyncService(deps.db, {
    pmClient: deps.pmClient,
    getAccessToken: deps.getAccessToken,
    spaceMappingDiscovery: deps.spaceMappingDiscovery,
  }).process(payload, rawBody, deps.syncId);
}

/** @deprecated Prefer WorklogSyncService.retry */
export async function retryWorklogSync(
  syncId: string,
  deps: {
    db: Db;
    pmClient?: InternalPmClient;
    getAccessToken?: () => Promise<string | null>;
  },
): Promise<SyncResult> {
  return createWorklogSyncService(deps.db, {
    pmClient: deps.pmClient,
    getAccessToken: deps.getAccessToken,
  }).retry(syncId);
}
