export const DASHBOARD_RANGES = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
] as const;

export type DashboardRange = (typeof DASHBOARD_RANGES)[number]["value"];

export const DEFAULT_DASHBOARD_RANGE: DashboardRange = "7d";

export type DashboardScope =
  | { type: "all" }
  | { type: "user"; userId: string; userEmail: string };

export function parseDashboardRange(value: unknown): DashboardRange {
  if (
    typeof value === "string" &&
    DASHBOARD_RANGES.some((r) => r.value === value)
  ) {
    return value as DashboardRange;
  }
  return DEFAULT_DASHBOARD_RANGE;
}

export function dashboardRangeLabel(range: DashboardRange): string {
  return DASHBOARD_RANGES.find((r) => r.value === range)?.label ?? range;
}

/** Start of the selected window. */
export function rangeSince(range: DashboardRange, now: Date = new Date()): Date {
  const ms =
    range === "24h"
      ? 24 * 60 * 60 * 1000
      : range === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : range === "30d"
          ? 30 * 24 * 60 * 60 * 1000
          : 90 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms);
}

/** Number of volume buckets for the chart (hours for 24h, days otherwise). */
export function volumeBucketCount(range: DashboardRange): number {
  if (range === "24h") return 24;
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  return 90;
}

export function volumeGranularity(
  range: DashboardRange,
): "hour" | "day" {
  return range === "24h" ? "hour" : "day";
}

export type StatusCounts = {
  synced: number;
  failed: number;
  skipped: number;
  pending: number;
};

export type SkipReasonCount = {
  reason: string;
  count: number;
};

export type ProblemSpaceCount = {
  jiraSpaceId: string | null;
  count: number;
};

export type VolumeBucket = {
  key: string;
  label: string;
  count: number;
};

export type RecentIssue = {
  id: string;
  jiraWorklogId: string;
  jiraIssueKey: string | null;
  jiraSpaceId: string | null;
  eventType: string;
  status: string;
  error: string | null;
  createdAt: string;
  canRetry: boolean;
};

export type AdminConfigStats = {
  kind: "admin";
  spaceMappings: { total: number; enabled: number; disabled: number };
  userMappings: { total: number; enabled: number };
  usersWithOverrides: number;
  bitmapTokenConfigured: boolean;
};

export type UserConfigStats = {
  kind: "user";
  linkedMapping: boolean;
  overrides: { total: number; enabled: number; disabled: number };
  availableSpaces: number;
  spacesMissingOverride: number;
};

export type DashboardStats = {
  range: DashboardRange;
  rangeLabel: string;
  scopeType: "all" | "user";
  window: StatusCounts;
  successRate: number | null;
  openFailed: number;
  openPending: number;
  skipReasons: SkipReasonCount[];
  problemSpaces: ProblemSpaceCount[];
  volume: VolumeBucket[];
  volumeGranularity: "hour" | "day";
  config: AdminConfigStats | UserConfigStats;
  recentIssues: RecentIssue[];
};

export function emptyAdminConfig(): AdminConfigStats {
  return {
    kind: "admin",
    spaceMappings: { total: 0, enabled: 0, disabled: 0 },
    userMappings: { total: 0, enabled: 0 },
    usersWithOverrides: 0,
    bitmapTokenConfigured: false,
  };
}

export function emptyUserConfig(): UserConfigStats {
  return {
    kind: "user",
    linkedMapping: false,
    overrides: { total: 0, enabled: 0, disabled: 0 },
    availableSpaces: 0,
    spacesMissingOverride: 0,
  };
}

export function emptyDashboardStats(
  range: DashboardRange = DEFAULT_DASHBOARD_RANGE,
  scopeType: "all" | "user" = "all",
  now: Date = new Date(),
): DashboardStats {
  return assembleDashboardStats({
    range,
    scopeType,
    windowRows: [],
    openFailed: 0,
    openPending: 0,
    skipReasons: [],
    problemSpaces: [],
    volumeRows: [],
    config: scopeType === "user" ? emptyUserConfig() : emptyAdminConfig(),
    recentIssueRows: [],
    now,
  });
}

export function emptyStatusCounts(): StatusCounts {
  return { synced: 0, failed: 0, skipped: 0, pending: 0 };
}

export function statusCountsFromRows(
  rows: Array<{ status: string; count: number }>,
): StatusCounts {
  const counts = emptyStatusCounts();
  for (const row of rows) {
    const n = Number(row.count) || 0;
    if (row.status === "synced") counts.synced = n;
    else if (row.status === "failed") counts.failed = n;
    else if (row.status === "skipped") counts.skipped = n;
    else if (row.status === "pending") counts.pending = n;
  }
  return counts;
}

export function successRate(counts: StatusCounts): number | null {
  const completed = counts.synced + counts.failed + counts.skipped;
  if (completed === 0) return null;
  return counts.synced / completed;
}

function toUtcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toUtcHourKey(d: Date): string {
  return d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

function formatHourLabel(isoHourKey: string): string {
  const hour = Number(isoHourKey.slice(11, 13));
  return `${hour}:00`;
}

function formatDayLabel(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(month)}/${Number(day)}`;
}

/** Fill volume buckets for the selected range, including zeros. */
export function buildVolumeBuckets(
  rows: Array<{ bucket: string | Date; count: number }>,
  range: DashboardRange,
  now: Date = new Date(),
): VolumeBucket[] {
  const granularity = volumeGranularity(range);
  const bucketCount = volumeBucketCount(range);
  const byKey = new Map<string, number>();

  for (const row of rows) {
    let key: string;
    if (typeof row.bucket === "string") {
      key =
        granularity === "hour"
          ? row.bucket.slice(0, 13).replace(" ", "T")
          : row.bucket.slice(0, 10);
    } else if (granularity === "hour") {
      key = toUtcHourKey(row.bucket);
    } else {
      key = toUtcDateKey(row.bucket);
    }
    byKey.set(key, Number(row.count) || 0);
  }

  const result: VolumeBucket[] = [];
  for (let i = bucketCount - 1; i >= 0; i--) {
    if (granularity === "hour") {
      const d = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          now.getUTCHours() - i,
        ),
      );
      const key = toUtcHourKey(d);
      result.push({
        key,
        label: formatHourLabel(key),
        count: byKey.get(key) ?? 0,
      });
    } else {
      const d = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - i,
        ),
      );
      const key = toUtcDateKey(d);
      result.push({
        key,
        label: formatDayLabel(key),
        count: byKey.get(key) ?? 0,
      });
    }
  }
  return result;
}

export function mappingCountsFromRows(
  rows: Array<{ enabled: boolean; count: number }>,
): { total: number; enabled: number; disabled: number } {
  let enabled = 0;
  let disabled = 0;
  for (const row of rows) {
    const n = Number(row.count) || 0;
    if (row.enabled) enabled = n;
    else disabled = n;
  }
  return { total: enabled + disabled, enabled, disabled };
}

type StatusCountRow = { status: string; count: number };

export function assembleDashboardStats(parts: {
  range: DashboardRange;
  scopeType: "all" | "user";
  windowRows: StatusCountRow[];
  openFailed: number;
  openPending: number;
  skipReasons: Array<{ reason: string | null; count: number }>;
  problemSpaces: Array<{ jiraSpaceId: string | null; count: number }>;
  volumeRows: Array<{ bucket: string | Date; count: number }>;
  config: AdminConfigStats | UserConfigStats;
  recentIssueRows: Array<{
    id: string;
    jiraWorklogId: string;
    jiraIssueKey: string | null;
    jiraSpaceId: string | null;
    eventType: string;
    status: string;
    error: string | null;
    rawPayload: string | null;
    createdAt: Date | string;
  }>;
  now?: Date;
}): DashboardStats {
  const window = statusCountsFromRows(parts.windowRows);
  const range = parts.range;

  return {
    range,
    rangeLabel: dashboardRangeLabel(range),
    scopeType: parts.scopeType,
    window,
    successRate: successRate(window),
    openFailed: parts.openFailed,
    openPending: parts.openPending,
    skipReasons: parts.skipReasons.map((r) => ({
      reason: r.reason ?? "unknown",
      count: Number(r.count) || 0,
    })),
    problemSpaces: parts.problemSpaces.map((r) => ({
      jiraSpaceId: r.jiraSpaceId,
      count: Number(r.count) || 0,
    })),
    volume: buildVolumeBuckets(parts.volumeRows, range, parts.now),
    volumeGranularity: volumeGranularity(range),
    config: parts.config,
    recentIssues: parts.recentIssueRows.map((row) => ({
      id: row.id,
      jiraWorklogId: row.jiraWorklogId,
      jiraIssueKey: row.jiraIssueKey,
      jiraSpaceId: row.jiraSpaceId,
      eventType: row.eventType,
      status: row.status,
      error: row.error,
      createdAt:
        typeof row.createdAt === "string"
          ? row.createdAt
          : row.createdAt.toISOString(),
      canRetry:
        Boolean(row.rawPayload) &&
        (row.status === "failed" || row.status === "skipped"),
    })),
  };
}
