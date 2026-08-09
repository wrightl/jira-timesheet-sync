"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/cn";
import {
  getCachedClients,
  getCachedDashboard,
  getCachedProjects,
  invalidateCachedClients,
  invalidateCachedDashboard,
  invalidateCachedProjects,
  readProjectsDashboardCache,
  setCachedClients,
  setCachedDashboard,
  setCachedProjects,
  setProjectsDashboardSelection,
} from "@/lib/projects-dashboard-cache";
import type { ProjectListStatus } from "@/lib/project-list-status";
import type {
  BudgetLineBurn,
  DashboardMetric,
  MetricStatus,
  ProjectDashboardResult,
} from "@/services/project-dashboard";

type BitmapClientOption = {
  id: string;
  name: string;
  client_key?: string | null;
  has_projects?: boolean | null;
};

type BitmapProjectOption = {
  id: string;
  name?: string | null;
  key?: string | null;
  state?: string | null;
};

function clientLabel(client: BitmapClientOption): string {
  return client.name?.trim() || client.client_key || client.id;
}

function projectLabel(
  project: BitmapProjectOption,
  options?: { includeState?: boolean },
): string {
  const base = project.name ?? project.key ?? project.id;
  if (options?.includeState && project.state) {
    return `${base} (${project.state})`;
  }
  return base;
}

const PROJECT_STATUS_OPTIONS: Array<{
  value: ProjectListStatus;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
];

function statusVariant(
  status: MetricStatus,
): "ok" | "warning" | "danger" | "muted" {
  if (status === "ok") return "ok";
  if (status === "watch") return "warning";
  if (status === "risk") return "danger";
  return "muted";
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-muted/25",
        className,
      )}
      aria-hidden
    />
  );
}

function MetricCardSkeleton() {
  return (
    <Card aria-hidden>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-12 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="h-8 w-20" />
      <Skeleton className="mt-2 h-3 w-40" />
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading project dashboard</span>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[12rem] flex-1 space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-48" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
        <Skeleton className="mt-3 h-3 w-full max-w-xl" />
      </Card>

      <section className="space-y-3">
        <Skeleton className="h-3 w-16" />
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>
        <Card>
          <Skeleton className="mb-2 h-5 w-24" />
          <Skeleton className="mb-3 h-3 w-48" />
          <Skeleton className="h-40 w-full" />
        </Card>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-3 w-20" />
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>
        <Card>
          <Skeleton className="mb-3 h-5 w-32" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-3 w-16" />
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <Skeleton className="mb-3 h-5 w-24" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </Card>
          <Card>
            <Skeleton className="mb-3 h-5 w-28" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-5/6" />
              <Skeleton className="h-6 w-2/3" />
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  metric,
  children,
  loading = false,
}: {
  metric: DashboardMetric<unknown>;
  children?: ReactNode;
  loading?: boolean;
}) {
  const unavailable = metric.status === "unavailable";
  return (
    <Card
      className={cn(
        unavailable && "opacity-70",
        loading && "opacity-60",
      )}
      aria-busy={loading || undefined}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          {metric.label}
        </p>
        <Badge variant={statusVariant(metric.status)}>{metric.status}</Badge>
        <Badge variant="muted">{metric.source}</Badge>
      </div>
      {loading ? (
        <>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="mt-2 h-3 w-40" />
        </>
      ) : (
        <>
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {metric.displayValue}
          </p>
          {metric.detail ? (
            <p className="mt-1 text-xs text-muted">{metric.detail}</p>
          ) : null}
        </>
      )}
      {!loading && unavailable ? (
        <p className="mt-2 text-xs">
          <Link href="/settings" className="text-accent hover:underline">
            Configure Jira in Settings
          </Link>
        </p>
      ) : null}
      {children}
    </Card>
  );
}

function formatBurndownDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const day = Number(match[3]);
  const month = months[Number(match[2]) - 1] ?? match[2];
  return `${day} ${month}`;
}

function pickLabelIndices(length: number, maxLabels = 5): number[] {
  if (length <= 0) return [];
  if (length === 1) return [0];
  if (length <= maxLabels) {
    return Array.from({ length }, (_, i) => i);
  }
  const indices = new Set<number>();
  for (let i = 0; i < maxLabels; i += 1) {
    indices.add(Math.round((i / (maxLabels - 1)) * (length - 1)));
  }
  return [...indices].sort((a, b) => a - b);
}

function BurndownChart({
  burndown,
}: {
  burndown: ProjectDashboardResult["burndown"];
}) {
  const points = useMemo(() => {
    if (!burndown) return [];
    const actual = (burndown.burndown ?? []).map((p) => ({
      date: String(p.date),
      total: Number(p.total),
      series: "actual" as const,
    }));
    const forecast = (burndown.forecast ?? []).slice(1).map((p) => ({
      date: String(p.date),
      total: Number(p.total),
      series: "forecast" as const,
    }));
    return [...actual, ...forecast];
  }, [burndown]);

  if (points.length < 2) {
    return (
      <p className="text-sm text-muted">No burndown data for this project yet.</p>
    );
  }

  const width = 640;
  const height = 200;
  const padX = 16;
  const padTop = 12;
  const padBottom = 36;
  const plotBottom = height - padBottom;
  const totals = points.map((p) => p.total);
  const min = Math.min(0, ...totals);
  const max = Math.max(...totals, 1);
  const actualPoints = points.filter((p) => p.series === "actual");
  const forecastPoints = [
    ...(actualPoints.length ? [actualPoints[actualPoints.length - 1]] : []),
    ...points.filter((p) => p.series === "forecast"),
  ];

  const x = (i: number, len: number) =>
    padX + (i / Math.max(1, len - 1)) * (width - padX * 2);
  const y = (v: number) =>
    plotBottom -
    ((v - min) / (max - min || 1)) * (plotBottom - padTop);

  const toPath = (
    series: Array<{ date: string; total: number }>,
    allLen: number,
    offset: number,
  ) =>
    series
      .map((p, i) => {
        const cmd = i === 0 ? "M" : "L";
        return `${cmd}${x(offset + i, allLen)},${y(p.total)}`;
      })
      .join(" ");

  const allLen = points.length;
  const actualPath = toPath(actualPoints, allLen, 0);
  const forecastPath = toPath(
    forecastPoints,
    allLen,
    Math.max(0, actualPoints.length - 1),
  );
  const labelIndices = pickLabelIndices(allLen);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Project burndown chart"
    >
      <line
        x1={padX}
        y1={y(0)}
        x2={width - padX}
        y2={y(0)}
        stroke="var(--border)"
        strokeWidth="1"
      />
      <path
        d={actualPath}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
      />
      <path
        d={forecastPath}
        fill="none"
        stroke="var(--warning)"
        strokeWidth="2"
        strokeDasharray="5 4"
      />
      {labelIndices.map((i) => {
        const cx = x(i, allLen);
        const label = formatBurndownDate(points[i]?.date ?? "");
        const anchor =
          i === 0 ? "start" : i === allLen - 1 ? "end" : "middle";
        return (
          <g key={`${points[i]?.date}-${i}`}>
            <line
              x1={cx}
              y1={plotBottom}
              x2={cx}
              y2={plotBottom + 4}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={cx}
              y={height - 10}
              textAnchor={anchor}
              fill="var(--muted)"
              style={{ fontSize: 11 }}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineBurnBars({ lines }: { lines: BudgetLineBurn[] }) {
  if (lines.length === 0) {
    return <p className="mt-3 text-sm text-muted">No budget lines.</p>;
  }
  return (
    <ul className="mt-3 space-y-2">
      {lines.map((line) => {
        const pct = Math.min(100, Math.max(0, line.burnPct ?? 0));
        return (
          <li key={line.id}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium text-foreground">{line.name}</span>
              <span className="text-muted">
                {line.burnPct == null ? "—" : `${line.burnPct}%`}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-background">
              <div
                className="h-full rounded bg-accent"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ProjectProgressDashboard({ authed }: { authed: boolean }) {
  const initial = readProjectsDashboardCache();
  const [clients, setClients] = useState<BitmapClientOption[]>(
    () => initial.clients,
  );
  const [clientId, setClientId] = useState(() => initial.clientId);
  const [projectStatus, setProjectStatus] = useState<ProjectListStatus>(
    () => initial.projectStatus,
  );
  const [projects, setProjects] = useState<BitmapProjectOption[]>(
    () => initial.projects,
  );
  const [projectId, setProjectId] = useState(() => initial.projectId);
  const [dashboard, setDashboard] = useState<ProjectDashboardResult | null>(
    () => initial.dashboard,
  );
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dashboardRequestId = useRef(0);

  useEffect(() => {
    setProjectsDashboardSelection({ clientId, projectId, projectStatus });
  }, [clientId, projectId, projectStatus]);

  const applyProjects = useCallback((list: BitmapProjectOption[]) => {
    const sorted = [...list].sort((a, b) =>
      projectLabel(a).localeCompare(projectLabel(b), undefined, {
        sensitivity: "base",
      }),
    );
    setProjects(sorted);
    setProjectId((prev) => {
      if (sorted.length === 1) return sorted[0]?.id ?? "";
      if (prev && sorted.some((p) => p.id === prev)) return prev;
      return "";
    });
  }, []);

  const loadClients = useCallback(
    (options?: { refresh?: boolean; preferredClientId?: string }) => {
      if (!options?.refresh) {
        const cached = getCachedClients();
        if (cached) {
          setClients(cached);
          const preferred = options?.preferredClientId;
          setClientId((prev) => {
            const keep = preferred ?? prev;
            if (keep && cached.some((c) => c.id === keep)) return keep;
            return cached[0]?.id ?? "";
          });
          return;
        }
      }

      startTransition(async () => {
        setError(null);
        if (options?.refresh) invalidateCachedClients();
        const qs = options?.refresh ? "?refresh=1" : "";
        const res = await fetch(`/api/bitmap/clients${qs}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Failed to load Bitmap clients");
          setClients([]);
          return;
        }
        const data = await res.json();
        const list = [...((data.clients as BitmapClientOption[]) ?? [])];
        setCachedClients(list);
        setClients(list);
        const preferred = options?.preferredClientId;
        setClientId((prev) => {
          const keep = preferred ?? prev;
          if (keep && list.some((c) => c.id === keep)) return keep;
          return list[0]?.id ?? "";
        });
      });
    },
    [],
  );

  const loadProjectsForClient = useCallback(
    (
      id: string,
      status: ProjectListStatus,
      options?: { refresh?: boolean },
    ) => {
      if (!id) {
        setProjects([]);
        setProjectId("");
        return;
      }

      if (!options?.refresh) {
        const cached = getCachedProjects(id, status);
        if (cached) {
          applyProjects(cached);
          return;
        }
      }

      startTransition(async () => {
        setError(null);
        if (options?.refresh) invalidateCachedProjects(id, status);
        const params = new URLSearchParams({
          clientId: id,
          status,
        });
        if (options?.refresh) params.set("refresh", "1");
        const res = await fetch(`/api/bitmap/projects?${params}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Failed to load Bitmap projects");
          setProjects([]);
          setProjectId("");
          return;
        }
        const data = await res.json();
        const list = (data.projects as BitmapProjectOption[]) ?? [];
        setCachedProjects(id, list, status);
        applyProjects(list);
      });
    },
    [applyProjects],
  );

  useEffect(() => {
    if (authed) loadClients();
  }, [authed, loadClients]);

  useEffect(() => {
    loadProjectsForClient(clientId, projectStatus);
  }, [clientId, projectStatus, loadProjectsForClient]);

  const reloadLists = useCallback(() => {
    const selectedClientId = clientId;
    const selectedStatus = projectStatus;
    startTransition(async () => {
      setError(null);
      invalidateCachedClients();
      invalidateCachedProjects(selectedClientId || undefined, selectedStatus);
      const clientsRes = await fetch("/api/bitmap/clients?refresh=1");
      if (!clientsRes.ok) {
        const data = await clientsRes.json().catch(() => ({}));
        setError(data.error ?? "Failed to reload Bitmap clients");
        return;
      }
      const clientsData = await clientsRes.json();
      const list = [
        ...((clientsData.clients as BitmapClientOption[]) ?? []),
      ];
      setCachedClients(list);
      setClients(list);
      const nextClientId =
        selectedClientId && list.some((c) => c.id === selectedClientId)
          ? selectedClientId
          : (list[0]?.id ?? "");
      setClientId(nextClientId);

      if (!nextClientId) {
        setProjects([]);
        setProjectId("");
        setDashboard(null);
        setDashboardLoading(false);
        return;
      }

      invalidateCachedProjects(nextClientId, selectedStatus);
      const params = new URLSearchParams({
        clientId: nextClientId,
        status: selectedStatus,
        refresh: "1",
      });
      const projectsRes = await fetch(`/api/bitmap/projects?${params}`);
      if (!projectsRes.ok) {
        const data = await projectsRes.json().catch(() => ({}));
        setError(data.error ?? "Failed to reload Bitmap projects");
        setProjects([]);
        setProjectId("");
        return;
      }
      const projectsData = await projectsRes.json();
      const projectList =
        (projectsData.projects as BitmapProjectOption[]) ?? [];
      setCachedProjects(nextClientId, projectList, selectedStatus);
      applyProjects(projectList);
    });
  }, [applyProjects, clientId, projectStatus]);

  const loadDashboard = useCallback(
    (id: string, options?: { refresh?: boolean }) => {
      if (!id) {
        dashboardRequestId.current += 1;
        setDashboard(null);
        setDashboardLoading(false);
        return;
      }

      if (!options?.refresh) {
        const cached = getCachedDashboard(id);
        if (cached) {
          setDashboard(cached);
          setDashboardLoading(false);
          return;
        }
      }

      // Must be outside startTransition so the skeleton paints immediately.
      const requestId = ++dashboardRequestId.current;
      setError(null);
      setDashboardLoading(true);
      if (options?.refresh) invalidateCachedDashboard(id);
      void (async () => {
        try {
          const res = await fetch(
            `/api/projects/${encodeURIComponent(id)}/dashboard`,
          );
          if (requestId !== dashboardRequestId.current) return;
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(data.error ?? "Failed to load project dashboard");
            setDashboard(null);
            return;
          }
          const next = (await res.json()) as ProjectDashboardResult;
          setCachedDashboard(id, next);
          setDashboard(next);
        } catch (err) {
          if (requestId !== dashboardRequestId.current) return;
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load project dashboard",
          );
          setDashboard(null);
        } finally {
          if (requestId === dashboardRequestId.current) {
            setDashboardLoading(false);
          }
        }
      })();
    },
    [],
  );

  useEffect(() => {
    if (!projectId) {
      dashboardRequestId.current += 1;
      setDashboard(null);
      setDashboardLoading(false);
      return;
    }
    // Switching projects: keep matching cache, else drop so skeleton shows.
    setDashboard((prev) => {
      if (prev?.project.id === projectId) return prev;
      return getCachedDashboard(projectId);
    });
    loadDashboard(projectId);
  }, [projectId, loadDashboard]);

  if (!authed) {
    return (
      <Alert>
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>{" "}
        to view project progress.
      </Alert>
    );
  }

  const m = dashboard?.metrics;
  const dashboardMatchesProject = Boolean(
    dashboard && projectId && dashboard.project.id === projectId,
  );
  // First load / project switch: show skeleton whenever we lack matching data
  // (don't rely only on dashboardLoading — that can miss a paint).
  const showSkeleton = Boolean(
    projectId && !dashboardMatchesProject && !error,
  );
  const showDashboard = dashboardMatchesProject;
  const metricsBusy = Boolean(dashboardLoading && dashboardMatchesProject);

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle className="mb-2">Project</CardTitle>
        <CardDescription className="mb-4">
          Pick a Bitmap client and project status, then a project. Client and
          project lists are cached; use reload to refresh them from Bitmap.
          Budget metrics come from Bitmap; estimate and quality metrics prefer
          live Jira Cloud API v3 when configured.
        </CardDescription>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-muted">Client</span>
            <Select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={pending || clients.length === 0}
            >
              {clients.length === 0 ? (
                <option value="">No clients</option>
              ) : (
                clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {clientLabel(client)}
                  </option>
                ))
              )}
            </Select>
          </label>
          <label className="flex w-full flex-col gap-1 text-sm sm:w-36">
            <span className="text-muted">Status</span>
            <Select
              value={projectStatus}
              onChange={(e) =>
                setProjectStatus(e.target.value as ProjectListStatus)
              }
              disabled={pending || !clientId}
            >
              {PROJECT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-[1.2] flex-col gap-1 text-sm">
            <span className="text-muted">Project</span>
            <Select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={pending || !clientId || projects.length === 0}
            >
              {projects.length === 0 ? (
                <option value="">
                  {clientId ? "No projects" : "Select a client"}
                </option>
              ) : (
                <>
                  {projects.length > 1 ? (
                    <option value="">Select a project</option>
                  ) : null}
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {projectLabel(project, {
                        includeState: projectStatus === "all",
                      })}
                    </option>
                  ))}
                </>
              )}
            </Select>
          </label>
          <div className="flex gap-2">
            <RefreshButton
              pending={pending}
              onClick={reloadLists}
              icon="reload"
              title="Reload clients & projects"
              aria-label="Reload clients and projects from Bitmap"
            />
            <RefreshButton
              pending={pending || dashboardLoading}
              disabled={!projectId}
              onClick={() => loadDashboard(projectId, { refresh: true })}
              title="Refresh dashboard"
              aria-label="Refresh project dashboard"
            />
          </div>
        </div>
      </Card>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {showSkeleton ? <DashboardSkeleton /> : null}

      {showDashboard && dashboard && m ? (
        <div
          className="space-y-6"
          aria-busy={metricsBusy || undefined}
        >
          <Card className={cn(metricsBusy && "opacity-70")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>
                  {dashboard.project.name ?? dashboard.project.id}
                </CardTitle>
                <CardDescription>
                  {[
                    dashboard.project.clientName,
                    dashboard.project.key,
                    dashboard.project.projectType,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </CardDescription>
                <p className="mt-2 text-xs text-muted">
                  {dashboard.project.startDate ?? "?"} →{" "}
                  {dashboard.project.endDate ?? "?"}
                  {dashboard.project.forecastEndDate
                    ? ` · forecast ${dashboard.project.forecastEndDate}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    dashboard.project.healthy === false ? "danger" : "ok"
                  }
                >
                  {dashboard.project.healthy === false
                    ? `Unhealthy (${dashboard.project.unhealthyChecks ?? "?"})`
                    : "Healthy"}
                </Badge>
                <Badge
                  variant={dashboard.jiraConfigured ? "accent" : "warning"}
                >
                  {dashboard.jiraConfigured ? "Jira live" : "Jira unavailable"}
                </Badge>
                <Badge variant={statusVariant(m.budgetBurnPct.status)}>
                  Burn {m.budgetBurnPct.displayValue}
                </Badge>
                <Badge variant={statusVariant(m.estimateDeltaHours.status)}>
                  Δ {m.estimateDeltaHours.displayValue}
                </Badge>
              </div>
            </div>
            {dashboard.scopedJql ? (
              <p className="mt-3 font-mono text-xs text-muted">
                JQL: {dashboard.scopedJql}
              </p>
            ) : null}
            {dashboard.jiraError && !dashboard.jiraConfigured ? (
              <Alert className="mt-3" variant="info">
                {dashboard.jiraError}.{" "}
                <Link href="/settings" className="text-accent hover:underline">
                  Open Settings
                </Link>
              </Alert>
            ) : null}
            {dashboard.jiraError && dashboard.jiraConfigured ? (
              <Alert className="mt-3" variant="error">
                Jira error: {dashboard.jiraError}
              </Alert>
            ) : null}
          </Card>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
              Budget
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard metric={m.budgetBurnPct} loading={metricsBusy} />
              <MetricCard
                metric={m.billableRunwayHours}
                loading={metricsBusy}
              />
              <MetricCard
                metric={m.budgetLineItemBurn}
                loading={metricsBusy}
              >
                <LineBurnBars
                  lines={
                    (m.budgetLineItemBurn.value as BudgetLineBurn[]) ?? []
                  }
                />
              </MetricCard>
              <MetricCard
                metric={m.scheduleVsForecast}
                loading={metricsBusy}
              />
            </div>
            <Card className={cn(metricsBusy && "opacity-70")}>
              <CardTitle className="mb-2">Burndown</CardTitle>
              <CardDescription className="mb-3">
                Solid = actual remaining · dashed = forecast
              </CardDescription>
              {metricsBusy ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <BurndownChart burndown={dashboard.burndown} />
              )}
            </Card>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
              Estimates
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard
                metric={m.estimateDeltaHours}
                loading={metricsBusy}
              />
              <MetricCard
                metric={m.remainingEffortHours}
                loading={metricsBusy}
              />
              <MetricCard
                metric={m.estimateCoveragePct}
                loading={metricsBusy}
              />
              <MetricCard
                metric={m.ticketOverageRatePct}
                loading={metricsBusy}
              />
            </div>
            <Card className={cn(metricsBusy && "opacity-70")}>
              <CardTitle className="mb-2">Ticket overages</CardTitle>
              {metricsBusy ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : dashboard.overages.length === 0 ? (
                <p className="text-sm text-muted">No overages detected.</p>
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Issue</TableHeaderCell>
                      <TableHeaderCell>Overage</TableHeaderCell>
                      <TableHeaderCell>Source</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dashboard.overages.map((row) => (
                      <TableRow key={`${row.source}-${row.key}`}>
                        <TableCell>
                          <div className="font-mono text-xs">{row.key}</div>
                          <div className="text-xs text-muted">
                            {row.summary ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.overageHours == null
                            ? "—"
                            : `${row.overageHours}h`}
                          {row.unexpected ? (
                            <Badge variant="warning" className="ml-2">
                              unexpected
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>{row.source}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
              Quality
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard metric={m.openBugCount} loading={metricsBusy} />
              <MetricCard metric={m.qualityCostPct} loading={metricsBusy} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Card className={cn(metricsBusy && "opacity-70")}>
                <CardTitle className="mb-2">Open bugs</CardTitle>
                {metricsBusy ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : dashboard.openBugs.length === 0 ? (
                  <p className="text-sm text-muted">
                    {dashboard.jiraConfigured
                      ? "No open bugs in scope."
                      : "Configure Jira to load open bugs."}
                  </p>
                ) : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Bug</TableHeaderCell>
                        <TableHeaderCell>Priority</TableHeaderCell>
                        <TableHeaderCell>Age</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {dashboard.openBugs.slice(0, 15).map((bug) => (
                        <TableRow key={bug.key}>
                          <TableCell>
                            <div className="font-mono text-xs">{bug.key}</div>
                            <div className="text-xs text-muted">
                              {bug.summary ?? "—"}
                            </div>
                          </TableCell>
                          <TableCell>{bug.priority ?? "—"}</TableCell>
                          <TableCell>
                            {bug.ageDays == null ? "—" : `${bug.ageDays}d`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
              <Card className={cn(metricsBusy && "opacity-70")}>
                <CardTitle className="mb-2">Health checks</CardTitle>
                {metricsBusy ? (
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-5/6" />
                  </div>
                ) : dashboard.healthChecks.length === 0 ? (
                  <p className="text-sm text-muted">
                    No Bitmap health checks returned.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {dashboard.healthChecks.map((check, idx) => (
                      <li
                        key={check.id ?? `${check.type}-${idx}`}
                        className="flex items-start justify-between gap-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">
                            {check.name ?? check.type ?? "Check"}
                          </p>
                          {check.message ? (
                            <p className="text-xs text-muted">
                              {check.message}
                            </p>
                          ) : null}
                        </div>
                        <Badge
                          variant={
                            check.healthy === false ? "danger" : "ok"
                          }
                        >
                          {check.healthy === false ? "fail" : "ok"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
