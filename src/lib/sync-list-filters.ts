import type { WorklogSync } from "@/db/schema";
import {
  DASHBOARD_RANGES,
  rangeSince,
  type DashboardRange,
} from "@/lib/dashboard-shared";
import type { WorklogEventType } from "@/lib/worklog-parser";

export type SyncListStatus = WorklogSync["status"];

export const SYNC_STATUSES = [
  "pending",
  "synced",
  "skipped",
  "failed",
] as const satisfies readonly SyncListStatus[];

export const SYNC_EVENT_TYPES = [
  "worklog_created",
  "worklog_updated",
  "worklog_deleted",
] as const satisfies readonly WorklogEventType[];

export const SYNC_LIST_RANGES = [
  ...DASHBOARD_RANGES,
  { value: "all", label: "All time" },
] as const;

export type SyncListRange = (typeof SYNC_LIST_RANGES)[number]["value"];

export const DEFAULT_SYNC_LIST_RANGE: SyncListRange = "7d";
export const DEFAULT_SYNC_LIST_LIMIT = 25;

export const SYNC_LIST_SORTS = [
  "createdAt",
  "eventType",
  "issueKey",
  "status",
] as const;

export type SyncListSort = (typeof SYNC_LIST_SORTS)[number];
export type SyncListSortDir = "asc" | "desc";

export const DEFAULT_SYNC_LIST_SORT: SyncListSort = "createdAt";
export const DEFAULT_SYNC_LIST_SORT_DIR: SyncListSortDir = "desc";

export type SyncListFilters = {
  status?: SyncListStatus;
  eventType?: WorklogEventType;
  issueKey?: string;
  range: SyncListRange;
  limit: number;
  offset: number;
  sort: SyncListSort;
  dir: SyncListSortDir;
};

export function parseSyncStatus(value: unknown): SyncListStatus | undefined {
  if (
    typeof value === "string" &&
    (SYNC_STATUSES as readonly string[]).includes(value)
  ) {
    return value as SyncListStatus;
  }
  return undefined;
}

export function parseSyncEventType(
  value: unknown,
): WorklogEventType | undefined {
  if (
    typeof value === "string" &&
    (SYNC_EVENT_TYPES as readonly string[]).includes(value)
  ) {
    return value as WorklogEventType;
  }
  return undefined;
}

export function parseSyncListRange(value: unknown): SyncListRange {
  if (
    typeof value === "string" &&
    SYNC_LIST_RANGES.some((r) => r.value === value)
  ) {
    return value as SyncListRange;
  }
  return DEFAULT_SYNC_LIST_RANGE;
}

export function parseSyncListSort(value: unknown): SyncListSort {
  if (
    typeof value === "string" &&
    (SYNC_LIST_SORTS as readonly string[]).includes(value)
  ) {
    return value as SyncListSort;
  }
  return DEFAULT_SYNC_LIST_SORT;
}

export function parseSyncListSortDir(value: unknown): SyncListSortDir {
  if (value === "asc" || value === "desc") return value;
  return DEFAULT_SYNC_LIST_SORT_DIR;
}

export function parseIssueKeyParam(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Start of the selected window, or undefined for all time. */
export function syncListRangeSince(
  range: SyncListRange,
  now: Date = new Date(),
): Date | undefined {
  if (range === "all") return undefined;
  return rangeSince(range as DashboardRange, now);
}

export function parseSyncListFilters(
  searchParams: URLSearchParams,
  parseLimit: (params: URLSearchParams, defaultLimit?: number) => number,
  parseOffset: (params: URLSearchParams) => number,
): SyncListFilters {
  return {
    status: parseSyncStatus(searchParams.get("status")),
    eventType: parseSyncEventType(searchParams.get("eventType")),
    issueKey: parseIssueKeyParam(searchParams.get("issueKey")),
    range: parseSyncListRange(searchParams.get("range")),
    limit: parseLimit(searchParams, DEFAULT_SYNC_LIST_LIMIT),
    offset: parseOffset(searchParams),
    sort: parseSyncListSort(searchParams.get("sort")),
    dir: parseSyncListSortDir(searchParams.get("dir")),
  };
}
