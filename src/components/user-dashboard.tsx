"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  DASHBOARD_RANGES,
  type DashboardRange,
  type DashboardStats,
} from "@/lib/dashboard-shared";
import { formatDateTimeUtc } from "@/lib/format-date";
import { JiraIssueLink } from "@/components/jira-issue-link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
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

function statusVariant(
  status: string,
): "ok" | "warning" | "accent" | "danger" {
  if (status === "synced") return "ok";
  if (status === "skipped") return "warning";
  if (status === "pending" || status === "processing") return "accent";
  return "danger";
}

function formatPercent(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function volumeLabelStep(bucketCount: number): number {
  if (bucketCount <= 12) return 1;
  if (bucketCount <= 30) return 3;
  if (bucketCount <= 48) return 4;
  return 7;
}

export function UserDashboard({
  stats,
  range,
  jiraBrowseBaseUrl = null,
}: {
  stats: DashboardStats;
  range: DashboardRange;
  jiraBrowseBaseUrl?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const maxVolume = Math.max(1, ...stats.volume.map((d) => d.count));
  const labelStep = volumeLabelStep(stats.volume.length);
  const rangeHint = stats.rangeLabel.replace(/^Last /i, "");
  const userConfig = stats.config.kind === "user" ? stats.config : null;
  const hasActivity =
    stats.window.synced +
      stats.window.failed +
      stats.window.skipped +
      stats.window.pending +
      stats.openFailed +
      stats.openPending >
    0;

  const setRange = (next: DashboardRange) => {
    const params = new URLSearchParams();
    if (next !== "7d") params.set("range", next);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/?${qs}` : "/");
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-2 text-sm text-muted">
          <span className="sr-only">Time range</span>
          <Select
            className="w-auto min-w-[10.5rem]"
            value={range}
            disabled={pending}
            aria-label="Dashboard time range"
            onChange={(e) => setRange(e.target.value as DashboardRange)}
          >
            {DASHBOARD_RANGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <RefreshButton
          pending={pending}
          onClick={() => {
            setActionError(null);
            startTransition(() => {
              router.refresh();
            });
          }}
        />
      </div>

      {actionError ? <Alert variant="error">{actionError}</Alert> : null}

      {userConfig && !userConfig.linkedMapping ? (
        <Alert>
          Your login email is not linked to a Bitmap user mapping yet, so personal
          sync history may be empty. Ask an admin to set your Bitmap email on the
          matching Jira user mapping, or ensure it matches your login email.{" "}
          <Link href="/my-mappings" className="text-accent hover:underline">
            My mappings
          </Link>
        </Alert>
      ) : null}

      {!hasActivity && userConfig?.linkedMapping ? (
        <Alert>
          No attributed sync activity in this window. Worklogs you log in Jira
          will appear here once they sync.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          metricId="sync.synced"
          label="Synced"
          value={stats.window.synced}
          hint={rangeHint}
        />
        <KpiCard
          metricId="sync.failed"
          label="Failed"
          value={stats.openFailed}
          hint="Open (yours)"
        />
        <KpiCard
          metricId="sync.skipped"
          label="Skipped"
          value={stats.window.skipped}
          hint={rangeHint}
        />
        <KpiCard
          metricId="sync.pending"
          label="Pending"
          value={stats.openPending}
          hint="Backlog"
        />
        <KpiCard
          metricId="sync.success_rate"
          label="Success rate"
          value={formatPercent(stats.successRate)}
          hint={rangeHint}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle>Skip reasons</CardTitle>
          <CardDescription>{stats.rangeLabel}</CardDescription>
          {stats.skipReasons.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No skips in this window.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {stats.skipReasons.map((row) => (
                <li
                  key={row.reason}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="font-mono text-xs text-foreground">
                    {row.reason}
                  </span>
                  <span className="tabular-nums text-muted">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Problem spaces</CardTitle>
              <CardDescription>
                Failed or skipped events · {rangeHint}
              </CardDescription>
            </div>
            <Link
              href="/my-mappings"
              className="shrink-0 text-sm text-accent hover:underline"
            >
              My mappings
            </Link>
          </div>
          {stats.problemSpaces.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              No failed or skipped spaces in this window.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {stats.problemSpaces.map((row) => (
                <li
                  key={row.jiraSpaceId ?? "unknown"}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="font-mono text-xs text-foreground">
                    {row.jiraSpaceId ?? "unknown space"}
                  </span>
                  <span className="tabular-nums text-muted">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle>Your setup</CardTitle>
        <CardDescription>
          Bitmap link and project/budget overrides
        </CardDescription>
        {userConfig ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                Bitmap link
              </p>
              <p className="mt-1 text-sm text-foreground">
                {userConfig.linkedMapping ? (
                  <Badge variant="ok">Linked</Badge>
                ) : (
                  <Badge variant="warning">Not linked</Badge>
                )}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                Overrides
              </p>
              <p className="mt-1 text-sm text-foreground">
                {userConfig.overrides.enabled} enabled
                <span className="text-muted">
                  {" "}
                  / {userConfig.overrides.total} total
                </span>
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                Mapped spaces
              </p>
              <p className="mt-1 text-sm text-foreground">
                {userConfig.availableSpaces} available
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                Missing override
              </p>
              <p className="mt-1 text-sm text-foreground">
                {userConfig.spacesMissingOverride}
                {userConfig.spacesMissingOverride > 0 ? (
                  <>
                    {" "}
                    <Link
                      href="/my-mappings"
                      className="text-accent hover:underline"
                    >
                      Configure
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardTitle>Volume</CardTitle>
        <CardDescription>
          Your events per {stats.volumeGranularity} · {stats.rangeLabel} (UTC)
        </CardDescription>
        <div className="mt-4 flex h-28 items-end gap-0.5 sm:gap-1">
          {stats.volume.map((bucket, index) => {
            const heightPct = (bucket.count / maxVolume) * 100;
            const showLabel =
              index === 0 ||
              index === stats.volume.length - 1 ||
              index % labelStep === 0;
            return (
              <div
                key={bucket.key}
                className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
              >
                <span className="text-[10px] tabular-nums text-muted">
                  {bucket.count > 0 && stats.volume.length <= 30
                    ? bucket.count
                    : ""}
                </span>
                <div className="flex h-20 w-full items-end">
                  <div
                    className="w-full rounded-sm bg-accent/80"
                    style={{
                      height: `${Math.max(heightPct, bucket.count > 0 ? 4 : 0)}%`,
                    }}
                    title={`${bucket.key}: ${bucket.count}`}
                  />
                </div>
                <span className="h-3 text-[9px] text-muted sm:text-[10px]">
                  {showLabel ? bucket.label : ""}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Recent issues
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Your latest failed or skipped syncs · {rangeHint}
            </p>
          </div>
        </div>
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>When</TableHeaderCell>
              <TableHeaderCell>Event</TableHeaderCell>
              <TableHeaderCell>Worklog</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell />
            </tr>
          </TableHead>
          <TableBody>
            {stats.recentIssues.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted">
                  No failed or skipped syncs in this window.
                </TableCell>
              </TableRow>
            ) : (
              stats.recentIssues.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted">
                    {formatDateTimeUtc(s.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {s.eventType}
                  </TableCell>
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
                        disabled={retryingId === s.id || pending}
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
                              setActionError(
                                (data as { error?: string }).error ??
                                  "Retry failed",
                              );
                              return;
                            }
                            router.refresh();
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
      </div>

      <Card>
        <CardTitle>How this works</CardTitle>
        <CardDescription>
          Personal sync activity is attributed when your login email matches the
          Bitmap email on your Jira user mapping. Use{" "}
          <Link href="/my-mappings" className="text-accent hover:underline">
            My mappings
          </Link>{" "}
          to set project and budget overrides per space.
        </CardDescription>
      </Card>
    </div>
  );
}
