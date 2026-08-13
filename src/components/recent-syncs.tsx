"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDateTimeUtc } from "@/lib/format-date";
import {
  DEFAULT_SYNC_LIST_LIMIT,
  DEFAULT_SYNC_LIST_RANGE,
  DEFAULT_SYNC_LIST_SORT,
  DEFAULT_SYNC_LIST_SORT_DIR,
  SYNC_EVENT_TYPES,
  SYNC_LIST_RANGES,
  SYNC_STATUSES,
  parseIssueKeyParam,
  parseSyncEventType,
  parseSyncListRange,
  parseSyncListSort,
  parseSyncListSortDir,
  parseSyncStatus,
  type SyncListRange,
  type SyncListSort,
  type SyncListSortDir,
} from "@/lib/sync-list-filters";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JiraIssueLink } from "@/components/jira-issue-link";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";

type SyncRow = {
  id: string;
  jiraWorklogId: string;
  jiraIssueKey: string | null;
  jiraSpaceId: string | null;
  eventType: string;
  status: string;
  internalTimesheetId: string | null;
  error: string | null;
  createdAt: string;
  canRetry?: boolean;
};

function statusVariant(
  status: string,
): "ok" | "warning" | "accent" | "danger" {
  if (status === "synced") return "ok";
  if (status === "skipped") return "warning";
  if (status === "pending" || status === "processing") return "accent";
  return "danger";
}

function eventTypeLabel(eventType: string): string {
  if (eventType === "worklog_created") return "Created";
  if (eventType === "worklog_updated") return "Updated";
  if (eventType === "worklog_deleted") return "Deleted";
  return eventType;
}

type SyncQuery = {
  status: string;
  eventType: string;
  issueKey: string;
  range: SyncListRange;
  offset: number;
  limit: number;
  sort: SyncListSort;
  dir: SyncListSortDir;
};

function appendListParams(params: URLSearchParams, query: SyncQuery) {
  if (query.status) params.set("status", query.status);
  if (query.eventType) params.set("eventType", query.eventType);
  if (query.issueKey) params.set("issueKey", query.issueKey);
  if (query.range !== DEFAULT_SYNC_LIST_RANGE) {
    params.set("range", query.range);
  }
  if (
    query.sort !== DEFAULT_SYNC_LIST_SORT ||
    query.dir !== DEFAULT_SYNC_LIST_SORT_DIR
  ) {
    params.set("sort", query.sort);
    params.set("dir", query.dir);
  }
}

function buildSyncsQueryString(query: SyncQuery): string {
  const params = new URLSearchParams();
  params.set("limit", String(query.limit));
  if (query.offset > 0) params.set("offset", String(query.offset));
  appendListParams(params, query);
  return params.toString();
}

function buildPageUrlQuery(query: SyncQuery): string {
  const params = new URLSearchParams();
  if (query.offset > 0) {
    params.set(
      "page",
      String(Math.floor(query.offset / query.limit) + 1),
    );
  }
  appendListParams(params, query);
  return params.toString();
}

function hasActiveFilters(query: SyncQuery): boolean {
  return Boolean(
    query.status ||
      query.eventType ||
      query.issueKey ||
      query.range !== DEFAULT_SYNC_LIST_RANGE,
  );
}

export function RecentSyncs({
  authed,
  jiraBrowseBaseUrl = null,
}: {
  authed: boolean;
  jiraBrowseBaseUrl?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = useMemo((): SyncQuery => {
    const status = parseSyncStatus(searchParams.get("status")) ?? "";
    const eventType = parseSyncEventType(searchParams.get("eventType")) ?? "";
    const issueKey = parseIssueKeyParam(searchParams.get("issueKey")) ?? "";
    const range = parseSyncListRange(searchParams.get("range"));
    const sort = parseSyncListSort(searchParams.get("sort"));
    const dir = parseSyncListSortDir(searchParams.get("dir"));
    const limit = DEFAULT_SYNC_LIST_LIMIT;
    const pageRaw = searchParams.get("page");
    const pageNum = pageRaw ? Number(pageRaw) : 1;
    const page =
      Number.isFinite(pageNum) && pageNum > 0 ? Math.floor(pageNum) : 1;
    return {
      status,
      eventType,
      issueKey,
      range,
      sort,
      dir,
      limit,
      offset: (page - 1) * limit,
    };
  }, [searchParams]);

  const [syncs, setSyncs] = useState<SyncRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [issueKeyDraft, setIssueKeyDraft] = useState(query.issueKey);
  const [issueKeyFocused, setIssueKeyFocused] = useState(false);

  // Sync URL → draft only when the field is not focused, so loads don't clobber typing.
  useEffect(() => {
    if (issueKeyFocused) return;
    setIssueKeyDraft(query.issueKey);
  }, [query.issueKey, issueKeyFocused]);

  const replaceQuery = (next: Partial<SyncQuery>, options?: { resetPage?: boolean }) => {
    const merged: SyncQuery = {
      ...query,
      ...next,
      offset: options?.resetPage ? 0 : (next.offset ?? query.offset),
    };
    const qs = buildPageUrlQuery(merged);
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  };

  const apiQs = buildSyncsQueryString(query);

  const load = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/syncs?${apiQs}`);
      if (!res.ok) {
        setError("Could not load recent syncs");
        return;
      }
      const data = await res.json();
      setSyncs(data.syncs ?? []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    });
  };

  useEffect(() => {
    if (!authed) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when query string changes
  }, [authed, apiQs]);

  useEffect(() => {
    if (!authed) return;
    const hasPending = syncs.some(
      (s) => s.status === "pending" || s.status === "processing",
    );
    if (!hasPending) return;
    const timer = setInterval(() => {
      void fetch(`/api/syncs?${apiQs}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.syncs) {
            setSyncs(data.syncs);
            if (typeof data.total === "number") setTotal(data.total);
          }
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [authed, syncs, apiQs]);

  // Debounce issue-key filter commits so the table does not reload mid-typing.
  useEffect(() => {
    const handle = setTimeout(() => {
      const next = parseIssueKeyParam(issueKeyDraft) ?? "";
      if (next === query.issueKey) return;
      replaceQuery({ issueKey: next }, { resetPage: true });
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueKeyDraft]);

  if (!authed) {
    return (
      <p className="text-sm text-muted">Sign in to view recent sync activity.</p>
    );
  }

  const initialSortDir = (sort: SyncListSort): SyncListSortDir =>
    sort === "createdAt" ? "desc" : "asc";

  const toggleSort = (sort: SyncListSort) => {
    // Cycle: inactive → primary dir → opposite dir → default sort.
    if (query.sort !== sort) {
      replaceQuery({ sort, dir: initialSortDir(sort) }, { resetPage: true });
      return;
    }
    const primary = initialSortDir(sort);
    if (query.dir === primary) {
      replaceQuery(
        { dir: primary === "asc" ? "desc" : "asc" },
        { resetPage: true },
      );
      return;
    }
    replaceQuery(
      {
        sort: DEFAULT_SYNC_LIST_SORT,
        dir: DEFAULT_SYNC_LIST_SORT_DIR,
      },
      { resetPage: true },
    );
  };

  const sortIndicator = (sort: SyncListSort) => {
    if (query.sort !== sort) return "";
    return query.dir === "asc" ? " ↑" : " ↓";
  };

  const sortAria = (sort: SyncListSort): "none" | "ascending" | "descending" => {
    if (query.sort !== sort) return "none";
    return query.dir === "asc" ? "ascending" : "descending";
  };

  const from = total === 0 ? 0 : query.offset + 1;
  const to = Math.min(query.offset + query.limit, total);
  const canPrev = query.offset > 0;
  const canNext = query.offset + query.limit < total;
  const filtered = hasActiveFilters(query);
  const canClearFilters =
    filtered || Boolean(parseIssueKeyParam(issueKeyDraft));

  const clearFilters = () => {
    setIssueKeyFocused(false);
    setIssueKeyDraft("");
    replaceQuery(
      {
        status: "",
        eventType: "",
        issueKey: "",
        range: DEFAULT_SYNC_LIST_RANGE,
      },
      { resetPage: true },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[8rem] flex-col gap-1 text-xs text-muted">
          Status
          <Select
            className="w-auto min-w-[8rem]"
            value={query.status}
            disabled={pending}
            aria-label="Filter by status"
            onChange={(e) =>
              replaceQuery({ status: e.target.value }, { resetPage: true })
            }
          >
            <option value="">All</option>
            {SYNC_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-[9rem] flex-col gap-1 text-xs text-muted">
          Event
          <Select
            className="w-auto min-w-[9rem]"
            value={query.eventType}
            disabled={pending}
            aria-label="Filter by event type"
            onChange={(e) =>
              replaceQuery({ eventType: e.target.value }, { resetPage: true })
            }
          >
            <option value="">All</option>
            {SYNC_EVENT_TYPES.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventTypeLabel(eventType)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-[10.5rem] flex-col gap-1 text-xs text-muted">
          Range
          <Select
            className="w-auto min-w-[10.5rem]"
            value={query.range}
            disabled={pending}
            aria-label="Filter by date range"
            onChange={(e) =>
              replaceQuery(
                { range: e.target.value as SyncListRange },
                { resetPage: true },
              )
            }
          >
            {SYNC_LIST_RANGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-muted">
          Issue key
          <Input
            value={issueKeyDraft}
            placeholder="e.g. ABC-123"
            aria-label="Filter by issue key"
            onFocus={() => setIssueKeyFocused(true)}
            onBlur={() => {
              setIssueKeyFocused(false);
              const next = parseIssueKeyParam(issueKeyDraft) ?? "";
              if (next !== query.issueKey) {
                replaceQuery({ issueKey: next }, { resetPage: true });
              }
            }}
            onChange={(e) => setIssueKeyDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const next = parseIssueKeyParam(issueKeyDraft) ?? "";
                replaceQuery({ issueKey: next }, { resetPage: true });
              }
            }}
          />
        </label>
        <div className="ml-auto flex items-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={!canClearFilters || pending}
            onClick={clearFilters}
          >
            Clear filters
          </Button>
          <RefreshButton
            pending={pending}
            onClick={() => {
              setActionError(null);
              load();
            }}
          />
        </div>
      </div>
      {actionError ? <Alert variant="error">{actionError}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell aria-sort={sortAria("createdAt")}>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 uppercase tracking-wide hover:text-foreground"
                onClick={() => toggleSort("createdAt")}
              >
                When{sortIndicator("createdAt")}
              </button>
            </TableHeaderCell>
            <TableHeaderCell aria-sort={sortAria("eventType")}>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 uppercase tracking-wide hover:text-foreground"
                onClick={() => toggleSort("eventType")}
              >
                Event{sortIndicator("eventType")}
              </button>
            </TableHeaderCell>
            <TableHeaderCell aria-sort={sortAria("issueKey")}>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 uppercase tracking-wide hover:text-foreground"
                onClick={() => toggleSort("issueKey")}
              >
                Worklog{sortIndicator("issueKey")}
              </button>
            </TableHeaderCell>
            <TableHeaderCell aria-sort={sortAria("status")}>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 uppercase tracking-wide hover:text-foreground"
                onClick={() => toggleSort("status")}
              >
                Status{sortIndicator("status")}
              </button>
            </TableHeaderCell>
            <TableHeaderCell />
          </tr>
        </TableHead>
        <TableBody>
          {pending && syncs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted">
                Loading…
              </TableCell>
            </TableRow>
          ) : syncs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted">
                {filtered
                  ? "No syncs match these filters."
                  : "No sync events yet."}
              </TableCell>
            </TableRow>
          ) : (
            syncs.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted">
                  {formatDateTimeUtc(s.createdAt)}
                </TableCell>
                <TableCell className="font-mono text-xs">{s.eventType}</TableCell>
                <TableCell className="font-mono text-xs">
                  <JiraIssueLink
                    issueKey={s.jiraIssueKey}
                    baseUrl={jiraBrowseBaseUrl}
                  />{" "}
                  / {s.jiraWorklogId}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                  {s.error ? (
                    <span className="ml-2 text-xs text-muted">{s.error}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  {s.canRetry ? (
                    <button
                      type="button"
                      disabled={retryingId === s.id}
                      className="text-sm text-accent hover:underline disabled:opacity-60"
                      onClick={() => {
                        setActionError(null);
                        setRetryingId(s.id);
                        startTransition(async () => {
                          const res = await fetch(
                            `/api/syncs?action=retry&id=${s.id}`,
                            { method: "POST" },
                          );
                          const data = await res.json().catch(() => ({}));
                          setRetryingId(null);
                          if (!res.ok) {
                            setActionError(data.error ?? "Retry failed");
                            return;
                          }
                          load();
                        });
                      }}
                    >
                      {retryingId === s.id ? "Retrying…" : "Retry"}
                    </button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>
          {total === 0
            ? "Showing 0 of 0"
            : `Showing ${from}–${to} of ${total}`}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!canPrev || pending}
            onClick={() =>
              replaceQuery({
                offset: Math.max(0, query.offset - query.limit),
              })
            }
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!canNext || pending}
            onClick={() =>
              replaceQuery({
                offset: query.offset + query.limit,
              })
            }
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
