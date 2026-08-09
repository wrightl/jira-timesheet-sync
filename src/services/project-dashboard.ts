import type {
  BitmapBurndown,
  BitmapJiraTicket,
  BitmapProject,
  BitmapProjectBudget,
  BitmapProjectHealthCheck,
  BitmapTimesheetEntry,
} from "@/clients/bitmap-http";
import {
  createJiraMetricsService,
  type JiraIssueAggregates,
  type JiraMetricsService,
} from "@/services/jira-metrics";
import {
  createSettingsService,
  type SettingsService,
} from "@/services/settings-service";

export type MetricStatus = "ok" | "watch" | "risk" | "unavailable";
export type MetricSource = "bitmap" | "jira" | "merged";

export type DashboardMetric<T = number | string | null> = {
  id: string;
  label: string;
  value: T;
  displayValue: string;
  status: MetricStatus;
  source: MetricSource;
  detail?: string | null;
  unit?: string | null;
};

export type BudgetLineBurn = {
  id: string;
  name: string;
  budgetHours: number | null;
  usedHours: number | null;
  remainingHours: number | null;
  burnPct: number | null;
  billableUsedHours: number | null;
  billableRemainingHours: number | null;
};

export type ProjectDashboardResult = {
  project: {
    id: string;
    name: string | null;
    key: string | null;
    clientName: string | null;
    startDate: string | null;
    endDate: string | null;
    forecastEndDate: string | null;
    healthy: boolean | null;
    unhealthyChecks: number | null;
    projectType: string | null;
  };
  jiraConfigured: boolean;
  jiraError: string | null;
  jiraBrowseBaseUrl: string | null;
  scopedJql: string | null;
  metrics: {
    budgetBurnPct: DashboardMetric<number | null>;
    billableRunwayHours: DashboardMetric<number | null>;
    budgetLineItemBurn: DashboardMetric<BudgetLineBurn[]>;
    scheduleVsForecast: DashboardMetric<number | null>;
    paceDeltaPct: DashboardMetric<number | null>;
    allocationUtilizationPct: DashboardMetric<number | null>;
    billableMixPct: DashboardMetric<number | null>;
    runwayDays: DashboardMetric<number | null>;
    remainingHoursSlip: DashboardMetric<number | null>;
    estimateDeltaHours: DashboardMetric<number | null>;
    remainingEffortHours: DashboardMetric<number | null>;
    estimateCoveragePct: DashboardMetric<number | null>;
    ticketOverageRatePct: DashboardMetric<number | null>;
    openBugCount: DashboardMetric<number | null>;
    qualityCostPct: DashboardMetric<number | null>;
    defectInjectionRatio: DashboardMetric<number | null>;
    throughput30d: DashboardMetric<number | null>;
    agingWipCount: DashboardMetric<number | null>;
    healthCheckScore: DashboardMetric<number | null>;
  };
  burndown: BitmapBurndown | null;
  healthChecks: BitmapProjectHealthCheck[];
  overages: Array<{
    key: string;
    summary: string | null;
    overageHours: number | null;
    unexpected: boolean;
    source: MetricSource;
  }>;
  openBugs: JiraIssueAggregates["openBugs"];
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(numer: number, denom: number): number | null {
  if (!Number.isFinite(numer) || !Number.isFinite(denom) || denom <= 0) {
    return null;
  }
  return round1((numer / denom) * 100);
}

function formatHours(h: number | null): string {
  if (h == null || !Number.isFinite(h)) return "—";
  return `${round1(h)}h`;
}

function formatPct(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${round1(p)}%`;
}

function formatDays(d: number | null): string {
  if (d == null || !Number.isFinite(d)) return "—";
  if (d === 0) return "on schedule";
  if (d > 0) return `${d}d late`;
  return `${Math.abs(d)}d early`;
}

function dayDiff(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((ta - tb) / (24 * 60 * 60 * 1000));
}

function burnStatus(burnPct: number | null): MetricStatus {
  if (burnPct == null) return "unavailable";
  if (burnPct >= 100) return "risk";
  if (burnPct >= 85) return "watch";
  return "ok";
}

function coverageStatus(pctValue: number | null): MetricStatus {
  if (pctValue == null) return "unavailable";
  if (pctValue < 70) return "risk";
  if (pctValue < 90) return "watch";
  return "ok";
}

function deltaStatus(hours: number | null): MetricStatus {
  if (hours == null) return "unavailable";
  if (hours <= -8) return "risk";
  if (hours < 0) return "watch";
  return "ok";
}

function scheduleStatus(slipDays: number | null): MetricStatus {
  if (slipDays == null) return "unavailable";
  if (slipDays >= 7) return "risk";
  if (slipDays > 0) return "watch";
  return "ok";
}

function bugStatus(count: number | null): MetricStatus {
  if (count == null) return "unavailable";
  if (count >= 10) return "risk";
  if (count >= 3) return "watch";
  return "ok";
}

function qualityStatus(pctValue: number | null): MetricStatus {
  if (pctValue == null) return "unavailable";
  if (pctValue >= 15) return "risk";
  if (pctValue >= 5) return "watch";
  return "ok";
}

function overageStatus(pctValue: number | null): MetricStatus {
  if (pctValue == null) return "unavailable";
  if (pctValue >= 25) return "risk";
  if (pctValue >= 10) return "watch";
  return "ok";
}

export function calendarElapsedPct(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!startDate || !endDate) return null;
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }
  const elapsed = now.getTime() - start;
  const total = end - start;
  const raw = (elapsed / total) * 100;
  return round1(Math.min(100, Math.max(0, raw)));
}

export function paceStatus(paceDeltaPct: number | null): MetricStatus {
  if (paceDeltaPct == null) return "unavailable";
  if (paceDeltaPct > 15) return "risk";
  if (paceDeltaPct > 5) return "watch";
  return "ok";
}

export function allocationUtilizationStatus(
  pctValue: number | null,
): MetricStatus {
  if (pctValue == null) return "unavailable";
  if (pctValue > 110) return "risk";
  if (pctValue < 70) return "watch";
  return "ok";
}

export function billableMixStatus(pctValue: number | null): MetricStatus {
  if (pctValue == null) return "unavailable";
  if (pctValue < 70) return "risk";
  if (pctValue < 85) return "watch";
  return "ok";
}

export function defectInjectionStatus(ratio: number | null): MetricStatus {
  if (ratio == null) return "unavailable";
  if (ratio >= 1) return "risk";
  if (ratio >= 0.5) return "watch";
  return "ok";
}

export function throughputStatus(
  count: number | null,
  openIssueCount: number | null,
): MetricStatus {
  if (count == null) return "unavailable";
  if (count > 0) return "ok";
  if ((openIssueCount ?? 0) > 0) return "watch";
  return "ok";
}

export function agingWipStatus(count: number | null): MetricStatus {
  if (count == null) return "unavailable";
  if (count >= 10) return "risk";
  if (count >= 5) return "watch";
  return "ok";
}

export function runwayDaysStatus(days: number | null): MetricStatus {
  if (days == null) return "unavailable";
  if (days <= 5) return "risk";
  if (days <= 10) return "watch";
  return "ok";
}

export function remainingHoursSlipStatus(slipHours: number | null): MetricStatus {
  if (slipHours == null) return "unavailable";
  if (slipHours >= 16) return "risk";
  if (slipHours >= 8) return "watch";
  return "ok";
}

export function healthCheckScoreStatus(
  failingCount: number | null,
): MetricStatus {
  if (failingCount == null) return "unavailable";
  if (failingCount >= 3) return "risk";
  if (failingCount >= 1) return "watch";
  return "ok";
}

/** Bitmap burndown totals are seconds of remaining budget. */
function burndownTotalToHours(total: number): number {
  return total / 3600;
}

export function avgDailyBillableBurnHours(
  timesheets: BitmapTimesheetEntry[],
  burndown: BitmapBurndown | null,
  now: Date = new Date(),
): number | null {
  const windowMs = 14 * 24 * 60 * 60 * 1000;
  const cutoff = now.getTime() - windowMs;
  const byDay = new Map<string, number>();

  for (const entry of timesheets) {
    if (entry.billable === false) continue;
    const hours = typeof entry.hours === "number" ? entry.hours : 0;
    if (!Number.isFinite(hours) || hours <= 0) continue;
    const date = entry.date ? String(entry.date).slice(0, 10) : null;
    if (!date) continue;
    const t = Date.parse(date);
    if (!Number.isFinite(t) || t < cutoff) continue;
    byDay.set(date, (byDay.get(date) ?? 0) + hours);
  }

  if (byDay.size > 0) {
    let sum = 0;
    for (const h of byDay.values()) sum += h;
    return round2(sum / byDay.size);
  }

  const points = (burndown?.burndown ?? [])
    .map((p) => ({
      date: String(p.date).slice(0, 10),
      hours: burndownTotalToHours(Number(p.total)),
    }))
    .filter((p) => Number.isFinite(p.hours))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < 2) return null;
  const recent = points.slice(-14);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last) return null;
  const daySpan = Math.max(
    1,
    Math.round(
      (Date.parse(last.date) - Date.parse(first.date)) / (24 * 60 * 60 * 1000),
    ),
  );
  // Remaining hours dropped → positive burn
  const burned = first.hours - last.hours;
  if (!Number.isFinite(burned) || burned <= 0) return null;
  return round2(burned / daySpan);
}

export function burndownRemainingSlipHours(
  burndown: BitmapBurndown | null,
  lookbackDays = 7,
): number | null {
  const points = (burndown?.burndown ?? [])
    .map((p) => ({
      date: String(p.date).slice(0, 10),
      hours: burndownTotalToHours(Number(p.total)),
    }))
    .filter((p) => Number.isFinite(p.hours))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  if (!latest) return null;
  const targetMs =
    Date.parse(latest.date) - lookbackDays * 24 * 60 * 60 * 1000;

  let prior = points[0];
  for (const point of points) {
    if (Date.parse(point.date) <= targetMs) prior = point;
  }
  if (!prior || prior.date === latest.date) return null;
  // Positive = remaining grew (bad slip)
  return round1(latest.hours - prior.hours);
}

function formatPaceDelta(delta: number | null): string {
  if (delta == null || !Number.isFinite(delta)) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${round1(delta)}pp`;
}

function formatSlipHours(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  const sign = hours > 0 ? "+" : "";
  return `${sign}${round1(hours)}h`;
}

function formatRatio(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return String(round2(ratio));
}

function unavailableMetric<T>(
  id: string,
  label: string,
  source: MetricSource,
  detail: string,
): DashboardMetric<T | null> {
  return {
    id,
    label,
    value: null,
    displayValue: "—",
    status: "unavailable",
    source,
    detail,
  };
}

function forecastEndFromBurndown(burndown: BitmapBurndown | null): string | null {
  if (!burndown?.forecast?.length) return null;
  const last = burndown.forecast[burndown.forecast.length - 1];
  return last?.date ? String(last.date) : null;
}

function budgetHours(budget: BitmapProjectBudget): number | null {
  if (typeof budget.budget === "number") return budget.budget;
  if (
    typeof budget.time_used === "number" &&
    typeof budget.time_remaining === "number"
  ) {
    return budget.time_used + budget.time_remaining;
  }
  return null;
}

export class ProjectDashboardService {
  constructor(
    private readonly settings: SettingsService = createSettingsService(),
    private readonly jiraMetrics: JiraMetricsService = createJiraMetricsService(),
  ) {}

  async getDashboard(projectId: string): Promise<ProjectDashboardResult> {
    const bitmap = await this.settings.createConfiguredBitmapClient();
    const project = await bitmap.getProject(projectId);

    const [budgets, burndown, healthChecks, jiraTickets, timesheets] =
      await Promise.all([
        this.safe(() => bitmap.listProjectBudgets(projectId), []),
        this.safe(() => bitmap.getProjectBurndown(projectId), null),
        this.safe(() => bitmap.listProjectHealthChecks(projectId), []),
        this.safe(() => bitmap.listProjectJiraTickets(projectId), []),
        this.safe(() => bitmap.listProjectTimesheetEntries(projectId), []),
      ]);

    const forecastEndDate =
      project.forecast_end_date ?? forecastEndFromBurndown(burndown);

    let jiraConfigured = false;
    let jiraError: string | null = null;
    let jiraAgg: JiraIssueAggregates | null = null;
    let scopedJql: string | null = project.jira_budget_jql ?? null;

    const jiraClient = await this.settings.createConfiguredJiraClient(
      project.jira_instance_url,
    );
    const creds = await this.settings.getJiraCredentials(
      project.jira_instance_url,
    );
    const jiraBrowseBaseUrl = creds.baseUrl;
    if (jiraClient) {
      jiraConfigured = true;
      try {
        jiraAgg = await this.jiraMetrics.computeForProject(jiraClient, {
          baseUrl: creds.baseUrl!,
          jiraBudgetJql: project.jira_budget_jql,
          projectKeyHint: project.key,
        });
        scopedJql = jiraAgg?.scopedJql ?? scopedJql;
      } catch (err) {
        jiraError = err instanceof Error ? err.message : String(err);
      }
    } else {
      jiraConfigured = await this.settings.isJiraConfigured(
        project.jira_instance_url,
      );
      if (!jiraConfigured) {
        jiraError = "Configure Jira Cloud API in Settings";
      }
    }

    const metrics = this.buildMetrics({
      project,
      budgets,
      burndown,
      forecastEndDate,
      jiraTickets,
      timesheets,
      healthChecks,
      jiraConfigured,
      jiraError,
      jiraAgg,
    });

    const overages = this.buildOverages(jiraTickets, jiraAgg);

    return {
      project: {
        id: project.id || projectId,
        name: project.name ?? null,
        key: project.key ?? null,
        clientName: project.client?.name ?? null,
        startDate: project.start_date ?? null,
        endDate: project.end_date ?? null,
        forecastEndDate,
        healthy: project.healthy ?? null,
        unhealthyChecks: project.unhealthy_checks ?? null,
        projectType: project.project_type ?? null,
      },
      jiraConfigured,
      jiraError,
      jiraBrowseBaseUrl,
      scopedJql,
      metrics,
      burndown,
      healthChecks,
      overages,
      openBugs: jiraAgg?.openBugs ?? [],
    };
  }

  private async safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }

  private buildMetrics(input: {
    project: BitmapProject;
    budgets: BitmapProjectBudget[];
    burndown: BitmapBurndown | null;
    forecastEndDate: string | null;
    jiraTickets: BitmapJiraTicket[];
    timesheets: BitmapTimesheetEntry[];
    healthChecks: BitmapProjectHealthCheck[];
    jiraConfigured: boolean;
    jiraError: string | null;
    jiraAgg: JiraIssueAggregates | null;
  }): ProjectDashboardResult["metrics"] {
    const { project, budgets, jiraAgg, jiraConfigured, jiraError } = input;
    const jiraUnavailableDetail =
      jiraError ?? "Configure Jira Cloud API in Settings";
    const now = new Date();

    const budgeted =
      typeof project.time_budgeted === "number" ? project.time_budgeted : null;
    const billableUsed =
      typeof project.billable_time_used === "number"
        ? project.billable_time_used
        : null;
    const timeLogged =
      typeof project.time_logged === "number" ? project.time_logged : null;
    const timeAllocated =
      typeof project.time_allocated === "number"
        ? project.time_allocated
        : null;
    const usedForBurn = billableUsed ?? timeLogged;
    const burnPct = pct(usedForBurn ?? 0, budgeted ?? 0);

    const billableRemaining =
      typeof project.billable_time_remaining === "number"
        ? project.billable_time_remaining
        : typeof project.time_remaining === "number"
          ? project.time_remaining
          : null;

    const lines: BudgetLineBurn[] = budgets.map((b) => {
      const budget = budgetHours(b);
      const used =
        typeof b.time_used === "number"
          ? b.time_used
          : typeof b.billable_time_used === "number"
            ? b.billable_time_used
            : null;
      return {
        id: b.id,
        name: b.name,
        budgetHours: budget,
        usedHours: used,
        remainingHours:
          typeof b.time_remaining === "number" ? b.time_remaining : null,
        burnPct: pct(used ?? 0, budget ?? 0),
        billableUsedHours:
          typeof b.billable_time_used === "number"
            ? b.billable_time_used
            : null,
        billableRemainingHours:
          typeof b.billable_time_remaining === "number"
            ? b.billable_time_remaining
            : null,
      };
    });

    const worstLineBurn = lines.reduce<number | null>((max, line) => {
      if (line.burnPct == null) return max;
      if (max == null) return line.burnPct;
      return Math.max(max, line.burnPct);
    }, null);

    const slipDays = dayDiff(input.forecastEndDate, project.end_date);

    const elapsedPct = calendarElapsedPct(
      project.start_date,
      project.end_date,
      now,
    );
    const paceDeltaPct =
      burnPct != null && elapsedPct != null
        ? round1(burnPct - elapsedPct)
        : null;
    const allocationUtilizationPct = pct(timeLogged ?? 0, timeAllocated ?? 0);

    let billableHours = 0;
    let totalHours = 0;
    let qualityHours = 0;
    for (const entry of input.timesheets) {
      const hours = typeof entry.hours === "number" ? entry.hours : 0;
      totalHours += hours;
      if (entry.billable !== false) {
        billableHours += hours;
      }
      if (
        entry.billable === false &&
        (entry.nonbillable_reason ?? "").toLowerCase().includes("quality")
      ) {
        qualityHours += hours;
      }
    }
    const billableMixPct = pct(billableHours, totalHours);
    const dailyBurn = avgDailyBillableBurnHours(
      input.timesheets,
      input.burndown,
      now,
    );
    const runwayDays =
      billableRemaining != null && dailyBurn != null && dailyBurn > 0
        ? round1(billableRemaining / dailyBurn)
        : null;
    const remainingHoursSlip = burndownRemainingSlipHours(input.burndown, 7);

    const bitmapDelta =
      typeof project.remaining_jira_estimates_delta?.hours === "number"
        ? project.remaining_jira_estimates_delta.hours
        : null;
    const bitmapRemaining =
      typeof project.jira_budget_remaining_effort === "number"
        ? project.jira_budget_remaining_effort
        : null;
    const bitmapTimeRemaining =
      typeof project.time_remaining === "number"
        ? project.time_remaining
        : null;

    let estimateDeltaHours = bitmapDelta;
    let estimateDeltaSource: MetricSource = "bitmap";
    let estimateDeltaDetail: string | null =
      project.jira_budget_remaining_effort_last_updated
        ? `Bitmap sync ${project.jira_budget_remaining_effort_last_updated}`
        : null;

    if (jiraAgg && bitmapTimeRemaining != null) {
      const liveDelta = round2(
        jiraAgg.remainingEstimateHours - bitmapTimeRemaining,
      );
      estimateDeltaHours = liveDelta;
      estimateDeltaSource = "merged";
      if (bitmapDelta != null && Math.abs(liveDelta - bitmapDelta) >= 4) {
        estimateDeltaDetail = `Live Jira ${formatHours(liveDelta)} vs Bitmap sync ${formatHours(bitmapDelta)}`;
      } else {
        estimateDeltaDetail = `Live remaining ${formatHours(jiraAgg.remainingEstimateHours)} vs budget remaining ${formatHours(bitmapTimeRemaining)}`;
      }
    }

    let remainingEffort = bitmapRemaining;
    let remainingSource: MetricSource = "bitmap";
    let remainingDetail: string | null =
      project.jira_budget_last_sync_error ??
      (project.jira_budget_remaining_effort_last_updated
        ? `Updated ${project.jira_budget_remaining_effort_last_updated}`
        : null);

    if (jiraAgg) {
      remainingEffort = jiraAgg.remainingEstimateHours;
      remainingSource = "jira";
      remainingDetail = `${jiraAgg.openIssueCount} open issues in scope`;
    }

    let coveragePct: number | null = null;
    let coverageSource: MetricSource = "bitmap";
    let coverageDetail: string | null = null;
    if (jiraAgg) {
      coveragePct = jiraAgg.estimateCoveragePct;
      coverageSource = "jira";
      coverageDetail = `${jiraAgg.estimatedOpenCount}/${jiraAgg.openIssueCount} open issues estimated`;
    } else if (!jiraConfigured) {
      const missingEstimates = input.healthChecks.find((h) =>
        (h.type ?? h.name ?? "").toLowerCase().includes("estimate"),
      );
      coverageDetail = missingEstimates?.message ?? jiraUnavailableDetail;
    } else {
      coverageDetail = jiraUnavailableDetail;
    }

    let overageRate: number | null = null;
    let overageSource: MetricSource = "bitmap";
    let overageDetail: string | null = null;
    if (jiraAgg) {
      overageRate = jiraAgg.overageRatePct;
      overageSource = "jira";
      overageDetail = `${jiraAgg.overageCount} over by ${formatHours(jiraAgg.overageHours)}`;
    } else if (input.jiraTickets.length > 0) {
      const overs = input.jiraTickets.filter(
        (t) => (t.overage ?? 0) > 0 || t.unexpected_overage,
      );
      overageRate = pct(overs.length, input.jiraTickets.length);
      overageSource = "bitmap";
      overageDetail = `${overs.length}/${input.jiraTickets.length} Bitmap tickets over estimate`;
    } else if (!jiraConfigured) {
      overageDetail = jiraUnavailableDetail;
    }

    let openBugs: number | null = null;
    let bugsDetail: string | null = null;
    if (jiraAgg) {
      openBugs = jiraAgg.openBugCount;
      const oldest = jiraAgg.openBugs[0];
      bugsDetail = oldest
        ? `Oldest ${oldest.key} (${oldest.ageDays ?? "?"}d)`
        : "No open bugs in scope";
    } else {
      bugsDetail = jiraUnavailableDetail;
    }

    const qualityPct = pct(qualityHours, totalHours);
    const qualityDetail =
      totalHours > 0
        ? `${formatHours(qualityHours)} of ${formatHours(totalHours)} logged`
        : "No timesheet entries loaded";

    const healthTotal = input.healthChecks.length;
    const healthFailing = input.healthChecks.filter(
      (h) => h.healthy === false,
    ).length;
    const healthCheckScore = healthTotal > 0 ? healthFailing : null;

    return {
      budgetBurnPct: {
        id: "budget_burn_pct",
        label: "Budget burn",
        value: burnPct,
        displayValue: formatPct(burnPct),
        status: burnStatus(burnPct),
        source: "bitmap",
        unit: "%",
        detail:
          budgeted != null
            ? `${formatHours(usedForBurn)} of ${formatHours(budgeted)} budgeted`
            : "No time budget on project",
      },
      billableRunwayHours: {
        id: "billable_runway_hours",
        label: "Billable runway",
        value: billableRemaining,
        displayValue: formatHours(billableRemaining),
        status:
          billableRemaining == null
            ? "unavailable"
            : billableRemaining <= 0
              ? "risk"
              : billableRemaining < 8
                ? "watch"
                : "ok",
        source: "bitmap",
        unit: "h",
        detail: "Billable hours remaining on the project",
      },
      budgetLineItemBurn: {
        id: "budget_line_item_burn",
        label: "Budget line-item burn",
        value: lines,
        displayValue:
          lines.length === 0
            ? "—"
            : `${lines.length} lines · peak ${formatPct(worstLineBurn)}`,
        status: burnStatus(worstLineBurn),
        source: "bitmap",
        detail: lines.map((l) => `${l.name} ${formatPct(l.burnPct)}`).join(", "),
      },
      scheduleVsForecast: {
        id: "schedule_vs_forecast",
        label: "Schedule vs forecast",
        value: slipDays,
        displayValue: formatDays(slipDays),
        status: scheduleStatus(slipDays),
        source: "bitmap",
        detail:
          input.forecastEndDate && project.end_date
            ? `Forecast ${input.forecastEndDate} vs end ${project.end_date}`
            : "Forecast or end date unavailable",
      },
      paceDeltaPct:
        burnPct == null || elapsedPct == null
          ? unavailableMetric(
              "pace_delta_pct",
              "Pace",
              "bitmap",
              "Needs budget burn and project start/end dates",
            )
          : {
              id: "pace_delta_pct",
              label: "Pace",
              value: paceDeltaPct,
              displayValue: formatPaceDelta(paceDeltaPct),
              status: paceStatus(paceDeltaPct),
              source: "bitmap",
              unit: "pp",
              detail: `Burn ${formatPct(burnPct)} vs calendar ${formatPct(elapsedPct)}`,
            },
      allocationUtilizationPct:
        timeAllocated == null || timeAllocated <= 0
          ? unavailableMetric(
              "allocation_utilization_pct",
              "Allocation utilization",
              "bitmap",
              "No time allocated on project",
            )
          : {
              id: "allocation_utilization_pct",
              label: "Allocation utilization",
              value: allocationUtilizationPct,
              displayValue: formatPct(allocationUtilizationPct),
              status: allocationUtilizationStatus(allocationUtilizationPct),
              source: "bitmap",
              unit: "%",
              detail: `${formatHours(timeLogged)} logged of ${formatHours(timeAllocated)} allocated`,
            },
      billableMixPct:
        totalHours <= 0
          ? unavailableMetric(
              "billable_mix_pct",
              "Billable mix",
              "bitmap",
              "No timesheet entries loaded",
            )
          : {
              id: "billable_mix_pct",
              label: "Billable mix",
              value: billableMixPct,
              displayValue: formatPct(billableMixPct),
              status: billableMixStatus(billableMixPct),
              source: "bitmap",
              unit: "%",
              detail: `${formatHours(billableHours)} billable of ${formatHours(totalHours)} logged`,
            },
      runwayDays:
        runwayDays == null
          ? unavailableMetric(
              "runway_days",
              "Runway (days)",
              "bitmap",
              billableRemaining == null
                ? "No billable remaining hours"
                : "Need recent billable burn rate from timesheets or burndown",
            )
          : {
              id: "runway_days",
              label: "Runway (days)",
              value: runwayDays,
              displayValue: `${round1(runwayDays)}d`,
              status: runwayDaysStatus(runwayDays),
              source: "bitmap",
              unit: "d",
              detail: `${formatHours(billableRemaining)} remaining ÷ ${formatHours(dailyBurn)}/day`,
            },
      remainingHoursSlip:
        remainingHoursSlip == null
          ? unavailableMetric(
              "remaining_hours_slip",
              "Remaining hours slip",
              "bitmap",
              "Need burndown history spanning ~7 days",
            )
          : {
              id: "remaining_hours_slip",
              label: "Remaining hours slip",
              value: remainingHoursSlip,
              displayValue: formatSlipHours(remainingHoursSlip),
              status: remainingHoursSlipStatus(remainingHoursSlip),
              source: "bitmap",
              unit: "h",
              detail: "Change in remaining budget hours over ~7 days",
            },
      estimateDeltaHours: {
        id: "estimate_delta_hours",
        label: "Jira vs Bitmap estimate delta",
        value: estimateDeltaHours,
        displayValue: formatHours(estimateDeltaHours),
        status: deltaStatus(estimateDeltaHours),
        source: estimateDeltaSource,
        unit: "h",
        detail: estimateDeltaDetail,
      },
      remainingEffortHours: {
        id: "remaining_effort_hours",
        label: "Remaining effort",
        value: remainingEffort,
        displayValue: formatHours(remainingEffort),
        status:
          remainingEffort == null
            ? "unavailable"
            : remainingEffort > (bitmapTimeRemaining ?? remainingEffort) + 8
              ? "watch"
              : "ok",
        source: remainingSource,
        unit: "h",
        detail: remainingDetail,
      },
      estimateCoveragePct: jiraConfigured && !jiraAgg
        ? unavailableMetric(
            "estimate_coverage_pct",
            "Estimate coverage",
            "jira",
            jiraUnavailableDetail,
          )
        : {
            id: "estimate_coverage_pct",
            label: "Estimate coverage",
            value: coveragePct,
            displayValue: formatPct(coveragePct),
            status: coverageStatus(coveragePct),
            source: coverageSource,
            unit: "%",
            detail: coverageDetail,
          },
      ticketOverageRatePct:
        jiraConfigured && !jiraAgg && input.jiraTickets.length === 0
          ? unavailableMetric(
              "ticket_overage_rate_pct",
              "Ticket overage rate",
              "jira",
              jiraUnavailableDetail,
            )
          : {
              id: "ticket_overage_rate_pct",
              label: "Ticket overage rate",
              value: overageRate,
              displayValue: formatPct(overageRate),
              status: overageStatus(overageRate),
              source: overageSource,
              unit: "%",
              detail: overageDetail,
            },
      openBugCount: !jiraConfigured || (jiraConfigured && !jiraAgg)
        ? unavailableMetric(
            "open_bug_count",
            "Open bugs",
            "jira",
            jiraUnavailableDetail,
          )
        : {
            id: "open_bug_count",
            label: "Open bugs",
            value: openBugs,
            displayValue: openBugs == null ? "—" : String(openBugs),
            status: bugStatus(openBugs),
            source: "jira",
            detail: bugsDetail,
          },
      qualityCostPct: {
        id: "quality_cost_pct",
        label: "Rework / quality cost",
        value: qualityPct,
        displayValue: formatPct(qualityPct),
        status: qualityStatus(qualityPct),
        source: "bitmap",
        unit: "%",
        detail: qualityDetail,
      },
      defectInjectionRatio: !jiraConfigured || (jiraConfigured && !jiraAgg)
        ? unavailableMetric(
            "defect_injection_ratio",
            "Defect injection",
            "jira",
            jiraUnavailableDetail,
          )
        : {
            id: "defect_injection_ratio",
            label: "Defect injection",
            value: jiraAgg!.defectInjectionRatio,
            displayValue: formatRatio(jiraAgg!.defectInjectionRatio),
            status: defectInjectionStatus(jiraAgg!.defectInjectionRatio),
            source: "jira",
            detail: `${jiraAgg!.bugsCreatedInWindow} bugs / ${jiraAgg!.storiesCompletedInWindow} done (30d)`,
          },
      throughput30d: !jiraConfigured || (jiraConfigured && !jiraAgg)
        ? unavailableMetric(
            "throughput_30d",
            "Throughput (30d)",
            "jira",
            jiraUnavailableDetail,
          )
        : {
            id: "throughput_30d",
            label: "Throughput (30d)",
            value: jiraAgg!.storiesCompletedInWindow,
            displayValue: String(jiraAgg!.storiesCompletedInWindow),
            status: throughputStatus(
              jiraAgg!.storiesCompletedInWindow,
              jiraAgg!.openIssueCount,
            ),
            source: "jira",
            detail: "Stories/tasks/features completed in last 30 days",
          },
      agingWipCount: !jiraConfigured || (jiraConfigured && !jiraAgg)
        ? unavailableMetric(
            "aging_wip_count",
            "Aging WIP",
            "jira",
            jiraUnavailableDetail,
          )
        : {
            id: "aging_wip_count",
            label: "Aging WIP",
            value: jiraAgg!.agingWipCount,
            displayValue: String(jiraAgg!.agingWipCount),
            status: agingWipStatus(jiraAgg!.agingWipCount),
            source: "jira",
            detail: jiraAgg!.agingWipOldest
              ? `Oldest ${jiraAgg!.agingWipOldest.key} (${jiraAgg!.agingWipOldest.ageDays ?? "?"}d since update)`
              : "No open issues stale ≥14d",
          },
      healthCheckScore:
        healthTotal === 0
          ? unavailableMetric(
              "health_check_score",
              "Health checks",
              "bitmap",
              "No health checks returned",
            )
          : {
              id: "health_check_score",
              label: "Health checks",
              value: healthCheckScore,
              displayValue: `${healthFailing}/${healthTotal} failing`,
              status: healthCheckScoreStatus(healthFailing),
              source: "bitmap",
              detail:
                healthFailing === 0
                  ? "All Bitmap health checks passing"
                  : `${healthFailing} unhealthy check${healthFailing === 1 ? "" : "s"}`,
            },
    };
  }

  private buildOverages(
    tickets: BitmapJiraTicket[],
    jiraAgg: JiraIssueAggregates | null,
  ): ProjectDashboardResult["overages"] {
    if (jiraAgg) {
      return jiraAgg.issues
        .filter((issue) => {
          const original = (issue.fields.timeoriginalestimate ?? 0) / 3600;
          const spent = (issue.fields.timespent ?? 0) / 3600;
          return original > 0 && spent > original;
        })
        .map((issue) => {
          const original = (issue.fields.timeoriginalestimate ?? 0) / 3600;
          const spent = (issue.fields.timespent ?? 0) / 3600;
          return {
            key: issue.key,
            summary: issue.fields.summary ?? null,
            overageHours: round2(spent - original),
            unexpected: true,
            source: "jira" as const,
          };
        })
        .sort((a, b) => (b.overageHours ?? 0) - (a.overageHours ?? 0))
        .slice(0, 20);
    }

    return tickets
      .filter((t) => (t.overage ?? 0) > 0 || t.unexpected_overage)
      .map((t) => ({
        key: t.key,
        summary: t.summary ?? null,
        overageHours:
          typeof t.overage === "number" ? round2(t.overage) : null,
        unexpected: Boolean(t.unexpected_overage),
        source: "bitmap" as const,
      }))
      .slice(0, 20);
  }
}

export function createProjectDashboardService(
  settings?: SettingsService,
  jiraMetrics?: JiraMetricsService,
) {
  return new ProjectDashboardService(
    settings ?? createSettingsService(),
    jiraMetrics ?? createJiraMetricsService(),
  );
}
