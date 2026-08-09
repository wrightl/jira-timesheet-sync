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
  scopedJql: string | null;
  metrics: {
    budgetBurnPct: DashboardMetric<number | null>;
    billableRunwayHours: DashboardMetric<number | null>;
    budgetLineItemBurn: DashboardMetric<BudgetLineBurn[]>;
    scheduleVsForecast: DashboardMetric<number | null>;
    estimateDeltaHours: DashboardMetric<number | null>;
    remainingEffortHours: DashboardMetric<number | null>;
    estimateCoveragePct: DashboardMetric<number | null>;
    ticketOverageRatePct: DashboardMetric<number | null>;
    openBugCount: DashboardMetric<number | null>;
    qualityCostPct: DashboardMetric<number | null>;
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
    if (jiraClient) {
      jiraConfigured = true;
      try {
        const creds = await this.settings.getJiraCredentials(
          project.jira_instance_url,
        );
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

    const budgeted =
      typeof project.time_budgeted === "number" ? project.time_budgeted : null;
    const billableUsed =
      typeof project.billable_time_used === "number"
        ? project.billable_time_used
        : null;
    const timeLogged =
      typeof project.time_logged === "number" ? project.time_logged : null;
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

    let qualityHours = 0;
    let totalHours = 0;
    for (const entry of input.timesheets) {
      const hours = typeof entry.hours === "number" ? entry.hours : 0;
      totalHours += hours;
      if (
        entry.billable === false &&
        (entry.nonbillable_reason ?? "").toLowerCase().includes("quality")
      ) {
        qualityHours += hours;
      }
    }
    const qualityPct = pct(qualityHours, totalHours);
    let qualityDetail =
      totalHours > 0
        ? `${formatHours(qualityHours)} of ${formatHours(totalHours)} logged`
        : "No timesheet entries loaded";
    if (jiraAgg && jiraAgg.defectInjectionRatio != null) {
      qualityDetail += ` · defect ratio ${jiraAgg.defectInjectionRatio} (${jiraAgg.bugsCreatedInWindow} bugs / ${jiraAgg.storiesCompletedInWindow} done)`;
    }

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
        source: jiraAgg ? "merged" : "bitmap",
        unit: "%",
        detail: qualityDetail,
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
