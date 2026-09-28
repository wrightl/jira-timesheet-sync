"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/kpi-card";
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
import { LOW_PROFITABILITY_PCT } from "@/lib/profitability";
import type {
  ProfitabilityResult,
  ProfitabilityProjectOption,
} from "@/services/profitability-service";
import type { ProjectProfitability } from "@/lib/profitability";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatHours(value: number): string {
  return `${value.toFixed(1)}h`;
}

function profitabilityVariant(
  project: ProjectProfitability,
): "ok" | "warning" | "danger" | "muted" {
  if (project.profitabilityPct == null) return "muted";
  if (project.profitabilityPct < LOW_PROFITABILITY_PCT) return "danger";
  if (project.profitabilityPct < 100) return "warning";
  return "ok";
}

function projectNote(project: ProjectProfitability): string | null {
  const parts: string[] = [];
  if (project.loadError) parts.push(project.loadError);
  if (project.unratedHours > 0) {
    const roles = project.missingRoles.length
      ? ` (${project.missingRoles.join(", ")})`
      : "";
    parts.push(
      `${formatHours(project.unratedHours)} omitted with no role rate${roles}`,
    );
  }
  if (project.unpricedHours > 0) {
    parts.push(
      `${formatHours(project.unpricedHours)} omitted with no client day rate`,
    );
  }
  if (project.blendedClientRate) {
    parts.push("Client rate blends budget day rates");
  }
  return parts.length > 0 ? parts.join(". ") : null;
}

function optionLabel(option: ProfitabilityProjectOption): string {
  const name = option.projectName?.trim() || option.projectId;
  return option.clientName ? `${name} · ${option.clientName}` : name;
}

function ProfitabilityBars({
  projects,
}: {
  projects: ProjectProfitability[];
}) {
  const rows = projects.filter((project) => project.profitabilityPct != null);
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        No closed project in this range has both a charge and a role cost yet.
      </p>
    );
  }

  const max = Math.max(
    100,
    ...rows.map((project) => project.profitabilityPct ?? 0),
  );
  const labelWidth = 168;
  const chartWidth = 640;
  const rowHeight = 32;
  const paddingTop = 8;
  const height = paddingTop + rows.length * rowHeight + 8;
  const barLeft = labelWidth + 8;
  const barWidth = chartWidth - barLeft - 56;

  function xFor(pct: number): number {
    return barLeft + (pct / max) * barWidth;
  }

  return (
    <div className="overflow-x-auto">
      <svg
        role="img"
        aria-label="Profitability percentage for each closed project"
        viewBox={`0 0 ${chartWidth} ${height}`}
        className="h-auto min-w-[36rem] w-full"
      >
        <line
          x1={xFor(LOW_PROFITABILITY_PCT)}
          x2={xFor(LOW_PROFITABILITY_PCT)}
          y1={paddingTop}
          y2={height - 8}
          stroke="var(--danger)"
          strokeDasharray="3 3"
        />
        <line
          x1={xFor(100)}
          x2={xFor(100)}
          y1={paddingTop}
          y2={height - 8}
          stroke="var(--muted)"
          strokeDasharray="3 3"
        />
        {rows.map((project, index) => {
          const pct = project.profitabilityPct ?? 0;
          const y = paddingTop + index * rowHeight;
          const color =
            pct < LOW_PROFITABILITY_PCT
              ? "var(--danger)"
              : pct < 100
                ? "var(--warning)"
                : "var(--ok)";
          const name = project.projectName?.trim() || project.projectId;
          return (
            <g key={project.projectId}>
              <text
                x={0}
                y={y + 18}
                fontSize="12"
                className="fill-foreground"
              >
                {name.length > 22 ? `${name.slice(0, 21)}…` : name}
              </text>
              <rect
                x={barLeft}
                y={y + 6}
                width={Math.max((pct / max) * barWidth, pct > 0 ? 2 : 0)}
                height={14}
                rx={3}
                fill={color}
              />
              <text
                x={barLeft + (pct / max) * barWidth + 6}
                y={y + 17}
                fontSize="11"
                className="fill-muted"
              >
                {formatPct(pct)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-xs text-muted">
        Dashed red is the {LOW_PROFITABILITY_PCT}% floor. Dashed grey is 100%,
        where fees equal delivery cost.
      </p>
    </div>
  );
}

function ChargedCostBars({
  charged,
  cost,
}: {
  charged: number;
  cost: number;
}) {
  const max = Math.max(charged, cost, 1);
  const rows = [
    { label: "Charged", value: charged, color: "var(--accent)" },
    { label: "Cost", value: cost, color: "var(--warning)" },
  ];
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span>{row.label}</span>
            <span className="tabular-nums text-muted">{gbp.format(row.value)}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((row.value / max) * 100, row.value > 0 ? 2 : 0)}%`,
                background: row.color,
              }}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-muted">
        Gross profit {gbp.format(charged - cost)}. Overall profitability is
        charged divided by cost.
      </p>
    </div>
  );
}

export function ProfitabilityDashboard({ authed }: { authed: boolean }) {
  const [data, setData] = useState<ProfitabilityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [startDate, setStartDate] = useState(() => isoDaysAgo(90));
  const [endDate, setEndDate] = useState(() => todayIso());
  const [clientId, setClientId] = useState("all");
  const [projectId, setProjectId] = useState("all");

  const load = async () => {
    setPending(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (clientId !== "all") params.set("clientId", clientId);
      if (projectId !== "all") params.set("projectId", projectId);
      const res = await fetch(`/api/profitability?${params.toString()}`, {
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as
        | (ProfitabilityResult & { error?: string })
        | null;
      if (!res.ok) {
        setError(
          res.status === 401
            ? "Sign in required"
            : (body?.error ?? "Failed to load profitability"),
        );
        setData(null);
        return;
      }
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profitability");
      setData(null);
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    if (!authed) return;
    if (startDate > endDate) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload when the filters change
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, startDate, endDate, clientId, projectId]);

  if (!authed) {
    return (
      <p className="text-sm text-muted">Sign in to view project profitability.</p>
    );
  }

  const summary = data?.summary;
  const rangeInvalid = startDate > endDate;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-40 text-sm">
          <span className="mb-1 block text-muted">From</span>
          <Input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              setClientId("all");
              setProjectId("all");
            }}
          />
        </label>
        <label className="block min-w-40 text-sm">
          <span className="mb-1 block text-muted">To</span>
          <Input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(event) => {
              setEndDate(event.target.value);
              setClientId("all");
              setProjectId("all");
            }}
          />
        </label>
        <label className="block min-w-48 flex-1 text-sm">
          <span className="mb-1 block text-muted">Client</span>
          <Select
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              setProjectId("all");
            }}
            aria-label="Client"
          >
            <option value="all">All clients</option>
            {(data?.clientOptions ?? []).map((client) => (
              <option key={client.clientId} value={client.clientId}>
                {client.clientName}
              </option>
            ))}
          </Select>
        </label>
        <label className="block min-w-56 flex-1 text-sm">
          <span className="mb-1 block text-muted">Project</span>
          <Select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            aria-label="Project"
          >
            <option value="all">
              {clientId === "all" ? "All closed projects" : "All projects"}
            </option>
            {(data?.projectOptions ?? []).map((option) => (
              <option key={option.projectId} value={option.projectId}>
                {optionLabel(option)}
              </option>
            ))}
          </Select>
        </label>
        <RefreshButton pending={pending} onClick={() => void load()} />
      </div>

      {rangeInvalid ? (
        <Alert variant="error">The start date must be on or before the end date.</Alert>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {data?.truncated ? (
        <Alert>
          Showing the {data.projects.length} most recently closed projects in
          this range. Narrow the dates or pick a client or project to load the
          rest.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          metricId="profitability.average"
          label="Average profitability"
          value={formatPct(summary?.averageProfitabilityPct ?? null)}
          hint={
            summary
              ? `Mean of ${summary.ratedProjectCount} rated project${summary.ratedProjectCount === 1 ? "" : "s"}`
              : undefined
          }
        />
        <KpiCard
          metricId="profitability.overall"
          label="Overall profitability"
          value={formatPct(summary?.overallProfitabilityPct ?? null)}
          hint="Total charged ÷ total cost"
        />
        <KpiCard
          metricId="profitability.below_threshold"
          label={`Below ${LOW_PROFITABILITY_PCT}%`}
          value={summary?.belowThresholdCount ?? "—"}
          hint={
            summary
              ? `${summary.projectCount} closed project${summary.projectCount === 1 ? "" : "s"} in view`
              : undefined
          }
        />
        <KpiCard
          metricId="profitability.gross_profit"
          label="Gross profit"
          value={summary ? gbp.format(summary.grossProfit) : "—"}
          hint={
            summary?.medianProfitabilityPct != null
              ? `Median profitability ${formatPct(summary.medianProfitabilityPct)}`
              : undefined
          }
        />
        <KpiCard
          metricId="profitability.charged"
          label="Amount charged"
          value={summary ? gbp.format(summary.totalCharged) : "—"}
          hint="Billable days × client day rate"
        />
        <KpiCard
          metricId="profitability.cost"
          label="Delivery cost"
          value={summary ? gbp.format(summary.totalCost) : "—"}
          hint="Logged days × role cost day rate"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardTitle>Profitability by project</CardTitle>
          <CardDescription className="mb-4">
            100% means the client was charged the same amount the work cost.
            Higher is a surplus.
          </CardDescription>
          {pending && !data ? (
            <p className="text-sm text-muted">Loading profitability…</p>
          ) : (
            <ProfitabilityBars projects={data?.projects ?? []} />
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>Charged and cost</CardTitle>
          <CardDescription className="mb-4">
            Fees billed against the internal cost of the same time.
          </CardDescription>
          <ChargedCostBars
            charged={summary?.totalCharged ?? 0}
            cost={summary?.totalCost ?? 0}
          />
          {summary && summary.incompleteCount > 0 ? (
            <p className="mt-3 text-xs text-muted">
              {summary.incompleteCount} project
              {summary.incompleteCount === 1 ? "" : "s"} still have hours
              without a role rate, a client rate, or a load error. Those hours
              are left out of the ratio.
            </p>
          ) : null}
        </Card>
      </div>

      <Card>
        <CardTitle>Closed projects</CardTitle>
        <CardDescription className="mb-4">
          Bitmap projects completed with an end date in the selected range.
          {data && data.completedWithoutEndDate > 0
            ? ` ${data.completedWithoutEndDate} completed project${data.completedWithoutEndDate === 1 ? "" : "s"} with no end date are omitted.`
            : ""}
        </CardDescription>
        {!data || data.projects.length === 0 ? (
          <p className="text-sm text-muted">
            {pending
              ? "Loading closed projects…"
              : "No Bitmap projects closed in this date range."}
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Client</TableHeaderCell>
                <TableHeaderCell>Closed</TableHeaderCell>
                <TableHeaderCell className="text-right">Hours</TableHeaderCell>
                <TableHeaderCell className="text-right">Charged</TableHeaderCell>
                <TableHeaderCell className="text-right">Cost</TableHeaderCell>
                <TableHeaderCell className="text-right">
                  Profitability
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.projects.map((project) => {
                const note = projectNote(project);
                return (
                  <TableRow key={project.projectId}>
                    <TableCell>
                      <div className="font-medium">
                        {project.projectName?.trim() || project.projectId}
                      </div>
                      {note ? (
                        <p className="mt-1 max-w-sm text-xs text-muted">{note}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>{project.clientName ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {project.endDate}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatHours(project.hours)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {gbp.format(project.charged)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {gbp.format(project.cost)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={profitabilityVariant(project)}>
                        {formatPct(project.profitabilityPct)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
