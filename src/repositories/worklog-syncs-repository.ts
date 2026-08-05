import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Db } from "@/db";
import {
  worklogSyncs,
  type NewWorklogSync,
  type WorklogSync,
} from "@/db/schema";
import type { WorklogEventType } from "@/lib/worklog-parser";
import type { DashboardScope } from "@/lib/dashboard-shared";
import type {
  SyncListSort,
  SyncListSortDir,
} from "@/lib/sync-list-filters";

export type SyncStatus = WorklogSync["status"];

export type ListSyncsOptions = {
  limit: number;
  offset: number;
  appUserId?: string;
  status?: SyncStatus;
  eventType?: WorklogEventType;
  issueKey?: string;
  since?: Date;
  sort?: SyncListSort;
  dir?: SyncListSortDir;
};

export type FinalizeSyncData = {
  jiraWorklogId: string;
  jiraIssueKey: string | null;
  jiraSpaceId: string | null;
  eventType: WorklogEventType;
  internalTimesheetId: string | null;
  status: SyncStatus;
  payloadHash: string;
  rawPayload?: string | null;
  error?: string | null;
  authorAccountId?: string | null;
  authorDisplayName?: string | null;
  appUserId?: string | null;
};

const PENDING_STALE_MS = 15 * 60 * 1000;

export class WorklogSyncsRepository {
  constructor(private readonly db: Db) {}

  private listWhere(opts: ListSyncsOptions): SQL | undefined {
    const parts: SQL[] = [];
    if (opts.appUserId) {
      parts.push(eq(worklogSyncs.appUserId, opts.appUserId));
    }
    if (opts.status) {
      parts.push(eq(worklogSyncs.status, opts.status));
    }
    if (opts.eventType) {
      parts.push(eq(worklogSyncs.eventType, opts.eventType));
    }
    if (opts.issueKey) {
      parts.push(ilike(worklogSyncs.jiraIssueKey, `%${opts.issueKey}%`));
    }
    if (opts.since) {
      parts.push(gte(worklogSyncs.createdAt, opts.since));
    }
    if (parts.length === 0) return undefined;
    if (parts.length === 1) return parts[0];
    return and(...parts);
  }

  async list(
    opts: ListSyncsOptions,
  ): Promise<{ rows: WorklogSync[]; total: number }> {
    const where = this.listWhere(opts);
    const sort = opts.sort ?? "createdAt";
    const dir = opts.dir ?? "desc";
    const order = dir === "asc" ? asc : desc;
    const primary =
      sort === "eventType"
        ? order(worklogSyncs.eventType)
        : sort === "issueKey"
          ? order(worklogSyncs.jiraIssueKey)
          : sort === "status"
            ? order(worklogSyncs.status)
            : order(worklogSyncs.createdAt);
    // Stable tie-breaker so pages don't shuffle when values collide.
    const secondary =
      sort === "createdAt"
        ? order(worklogSyncs.id)
        : desc(worklogSyncs.createdAt);

    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(worklogSyncs)
        .where(where)
        .orderBy(primary, secondary)
        .limit(opts.limit)
        .offset(opts.offset),
      this.db.select({ value: count() }).from(worklogSyncs).where(where),
    ]);
    return { rows, total: totalRows[0]?.value ?? 0 };
  }

  async listRecent(limit: number, appUserId?: string): Promise<WorklogSync[]> {
    const { rows } = await this.list({ limit, offset: 0, appUserId });
    return rows;
  }

  async findById(id: string): Promise<WorklogSync | null> {
    const rows = await this.db
      .select()
      .from(worklogSyncs)
      .where(eq(worklogSyncs.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByPayloadHash(
    jiraWorklogId: string,
    eventType: WorklogEventType,
    payloadHash: string,
  ): Promise<WorklogSync | null> {
    const rows = await this.db
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

  async findLatestSyncedTimesheet(
    jiraWorklogId: string,
  ): Promise<{ timesheetId: string; rawPayload: string | null } | null> {
    const rows = await this.db
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
    const row = rows[0];
    if (!row?.internalTimesheetId) return null;
    return {
      timesheetId: row.internalTimesheetId,
      rawPayload: row.rawPayload ?? null,
    };
  }

  async findLatestSyncedTimesheetId(
    jiraWorklogId: string,
  ): Promise<string | null> {
    const prior = await this.findLatestSyncedTimesheet(jiraWorklogId);
    return prior?.timesheetId ?? null;
  }

  async insertPending(
    values: Omit<NewWorklogSync, "id" | "createdAt" | "updatedAt">,
  ): Promise<{ id: string } | null> {
    const [row] = await this.db
      .insert(worklogSyncs)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: worklogSyncs.id });
    return row ?? null;
  }

  async finalize(
    syncId: string | undefined,
    data: FinalizeSyncData,
  ): Promise<string | undefined> {
    const identity = {
      authorAccountId: data.authorAccountId ?? null,
      authorDisplayName: data.authorDisplayName ?? null,
      appUserId: data.appUserId ?? null,
    };

    if (syncId) {
      await this.db
        .update(worklogSyncs)
        .set({
          jiraIssueKey: data.jiraIssueKey,
          jiraSpaceId: data.jiraSpaceId,
          internalTimesheetId: data.internalTimesheetId,
          status: data.status,
          error: data.error ?? null,
          ...identity,
          updatedAt: new Date(),
        })
        .where(eq(worklogSyncs.id, syncId));
      return syncId;
    }

    const [row] = await this.db
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
        ...identity,
      })
      .onConflictDoNothing()
      .returning({ id: worklogSyncs.id });

    return row?.id;
  }

  /**
   * Atomically claim a failed/skipped row for retry.
   * Neon HTTP has no multi-statement transactions — this WHERE acts as CAS.
   */
  async claimForRetry(id: string): Promise<WorklogSync | null> {
    const [row] = await this.db
      .update(worklogSyncs)
      .set({
        status: "pending",
        error: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(worklogSyncs.id, id),
          inArray(worklogSyncs.status, ["failed", "skipped"]),
        ),
      )
      .returning();
    return row ?? null;
  }

  /** Reclaim rows stuck in pending longer than PENDING_STALE_MS. */
  async reclaimStalePending(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - PENDING_STALE_MS);
    const rows = await this.db
      .update(worklogSyncs)
      .set({
        status: "failed",
        error: "stale_pending_reclaimed",
        updatedAt: now,
      })
      .where(
        and(
          eq(worklogSyncs.status, "pending"),
          lt(worklogSyncs.updatedAt, cutoff),
        ),
      )
      .returning({ id: worklogSyncs.id });
    return rows.length;
  }

  private scopeAnd(
    scope: DashboardScope,
    ...conditions: SQL[]
  ): SQL | undefined {
    const parts: SQL[] = [...conditions];
    if (scope.type === "user") {
      parts.push(eq(worklogSyncs.appUserId, scope.userId));
    }
    if (parts.length === 0) return undefined;
    if (parts.length === 1) return parts[0];
    return and(...parts);
  }

  async dashboardWindowCounts(scope: DashboardScope, since: Date) {
    const where = this.scopeAnd(scope, gte(worklogSyncs.createdAt, since));
    return this.db
      .select({
        status: worklogSyncs.status,
        count: count(),
      })
      .from(worklogSyncs)
      .where(where)
      .groupBy(worklogSyncs.status);
  }

  async dashboardOpenCounts(scope: DashboardScope) {
    const where = this.scopeAnd(
      scope,
      inArray(worklogSyncs.status, ["failed", "pending"]),
    );
    return this.db
      .select({
        status: worklogSyncs.status,
        count: count(),
      })
      .from(worklogSyncs)
      .where(where)
      .groupBy(worklogSyncs.status);
  }

  async dashboardSkipReasons(scope: DashboardScope, since: Date) {
    const where = this.scopeAnd(
      scope,
      eq(worklogSyncs.status, "skipped"),
      gte(worklogSyncs.createdAt, since),
    );
    return this.db
      .select({
        reason: worklogSyncs.error,
        count: count(),
      })
      .from(worklogSyncs)
      .where(where)
      .groupBy(worklogSyncs.error)
      .orderBy(desc(count()));
  }

  async dashboardProblemSpaces(scope: DashboardScope, since: Date) {
    const where = this.scopeAnd(
      scope,
      inArray(worklogSyncs.status, ["failed", "skipped"]),
      gte(worklogSyncs.createdAt, since),
    );
    return this.db
      .select({
        jiraSpaceId: worklogSyncs.jiraSpaceId,
        count: count(),
      })
      .from(worklogSyncs)
      .where(where)
      .groupBy(worklogSyncs.jiraSpaceId)
      .orderBy(desc(count()))
      .limit(5);
  }

  async dashboardVolume(
    scope: DashboardScope,
    since: Date,
    granularity: "hour" | "day",
  ) {
    const volumeBucketExpr =
      granularity === "hour"
        ? sql<string>`(date_trunc('hour', ${worklogSyncs.createdAt} AT TIME ZONE 'UTC'))`.as(
            "bucket",
          )
        : sql<string>`(date_trunc('day', ${worklogSyncs.createdAt} AT TIME ZONE 'UTC'))::date`.as(
            "bucket",
          );

    const volumeGroupExpr =
      granularity === "hour"
        ? sql`date_trunc('hour', ${worklogSyncs.createdAt} AT TIME ZONE 'UTC')`
        : sql`(date_trunc('day', ${worklogSyncs.createdAt} AT TIME ZONE 'UTC'))::date`;

    const where = this.scopeAnd(scope, gte(worklogSyncs.createdAt, since));
    return this.db
      .select({
        bucket: volumeBucketExpr,
        count: count(),
      })
      .from(worklogSyncs)
      .where(where)
      .groupBy(volumeGroupExpr);
  }

  async dashboardRecentIssues(scope: DashboardScope, since: Date) {
    const where = this.scopeAnd(
      scope,
      inArray(worklogSyncs.status, ["failed", "skipped"]),
      gte(worklogSyncs.createdAt, since),
    );
    return this.db
      .select({
        id: worklogSyncs.id,
        jiraWorklogId: worklogSyncs.jiraWorklogId,
        jiraIssueKey: worklogSyncs.jiraIssueKey,
        jiraSpaceId: worklogSyncs.jiraSpaceId,
        eventType: worklogSyncs.eventType,
        status: worklogSyncs.status,
        error: worklogSyncs.error,
        rawPayload: worklogSyncs.rawPayload,
        createdAt: worklogSyncs.createdAt,
      })
      .from(worklogSyncs)
      .where(where)
      .orderBy(desc(worklogSyncs.createdAt))
      .limit(8);
  }
}
