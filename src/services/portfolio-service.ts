import type {
  BitmapApiClient,
  BitmapProject,
  BitmapTimesheetEntry,
} from "@/clients/bitmap-http";
import {
  emptyPortfolioSummary,
  filterPortfolioResult,
  isProjectInPortfolioWindow,
  summarisePortfolio,
  type PortfolioProjectRow,
  type PortfolioResult,
  type PortfolioRiskTier,
} from "@/lib/portfolio";
import {
  computeStaffingForecast,
} from "@/lib/staffing-forecast";
import { withoutExcludedClientProjects } from "@/lib/excluded-clients";
import {
  DEFAULT_ALERT_THRESHOLDS,
  type AlertThresholds,
} from "@/lib/alert-thresholds";
import {
  BUDGET_BURN_WATCH_PCT,
  RECENT_BURN_WINDOW_DAYS,
  billableRemainingHours as remainingHoursOnProject,
  computeBudgetBurnPct,
  estimateRunwayDays,
  groupTimesheetsByProjectId,
} from "@/lib/bitmap-project-metrics";
import { TeamsRepository } from "@/repositories/teams-repository";
import { WorklogSyncsRepository } from "@/repositories/worklog-syncs-repository";
import {
  createSettingsService,
  type SettingsService,
} from "@/services/settings-service";
import { getDb, type Db } from "@/db";

export {
  computeBudgetBurnPct,
  estimateRunwayDays,
} from "@/lib/bitmap-project-metrics";

function dayDiff(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((ta - tb) / (24 * 60 * 60 * 1000));
}

function ownerName(project: BitmapProject): string | null {
  return (
    project.tech_lead?.full_name?.trim() ||
    project.project_lead?.full_name?.trim() ||
    project.project_manager?.full_name?.trim() ||
    null
  );
}

export function scorePortfolioProject(
  project: BitmapProject,
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS,
  options?: {
    timesheets?: BitmapTimesheetEntry[];
    now?: Date;
  },
): PortfolioProjectRow {
  const budgetBurnPct = computeBudgetBurnPct(project);
  const runwayDays = estimateRunwayDays({
    project,
    timesheets: options?.timesheets,
    now: options?.now,
  });
  const scheduleSlipDays = dayDiff(
    project.forecast_end_date,
    project.end_date,
  );
  const unhealthyChecks =
    typeof project.unhealthy_checks === "number"
      ? project.unhealthy_checks
      : null;

  const riskReasons: string[] = [];
  let riskTier: PortfolioRiskTier = "ok";

  const elevate = (tier: PortfolioRiskTier) => {
    if (tier === "risk") riskTier = "risk";
    else if (tier === "watch" && riskTier === "ok") riskTier = "watch";
  };

  if (budgetBurnPct != null && budgetBurnPct >= thresholds.budgetBurnPctRisk) {
    riskReasons.push(`Budget burn ${budgetBurnPct}%`);
    elevate("risk");
  } else if (
    budgetBurnPct != null &&
    budgetBurnPct >= BUDGET_BURN_WATCH_PCT &&
    BUDGET_BURN_WATCH_PCT < thresholds.budgetBurnPctRisk
  ) {
    riskReasons.push(`Budget burn ${budgetBurnPct}%`);
    elevate("watch");
  }

  if (runwayDays != null && runwayDays <= thresholds.runwayDaysRisk) {
    riskReasons.push(`Runway ${runwayDays}d`);
    elevate("risk");
  } else if (runwayDays != null && runwayDays <= 10) {
    riskReasons.push(`Runway ${runwayDays}d`);
    elevate("watch");
  }

  if (
    scheduleSlipDays != null &&
    scheduleSlipDays >= thresholds.scheduleSlipDaysRisk
  ) {
    riskReasons.push(`Forecast ${scheduleSlipDays}d late`);
    elevate("risk");
  } else if (scheduleSlipDays != null && scheduleSlipDays > 0) {
    riskReasons.push(`Forecast ${scheduleSlipDays}d late`);
    elevate("watch");
  }

  if (unhealthyChecks != null && unhealthyChecks >= 3) {
    riskReasons.push(`${unhealthyChecks} failing health checks`);
    elevate("risk");
  } else if (unhealthyChecks != null && unhealthyChecks >= 1) {
    riskReasons.push(`${unhealthyChecks} failing health checks`);
    elevate("watch");
  }

  if (project.healthy === false && riskReasons.length === 0) {
    riskReasons.push("Marked unhealthy");
    elevate("watch");
  }

  const billableRemainingHours = remainingHoursOnProject(project);
  const forecast = computeStaffingForecast({
    remainingHours: billableRemainingHours,
    endDate: project.end_date,
    forecastEndDate: project.forecast_end_date,
    hasJiraRemainingEffort:
      typeof project.jira_budget_remaining_effort === "number",
  });

  if (
    forecast.staffingGapEngWeeks != null &&
    forecast.staffingGapEngWeeks >= 2 &&
    forecast.staffingAsk
  ) {
    riskReasons.push(forecast.staffingAsk);
    elevate("risk");
  } else if (
    forecast.staffingGapEngWeeks != null &&
    forecast.staffingGapEngWeeks >= 0.5 &&
    forecast.staffingAsk
  ) {
    riskReasons.push(forecast.staffingAsk);
    elevate("watch");
  }

  if (
    budgetBurnPct == null &&
    runwayDays == null &&
    scheduleSlipDays == null &&
    unhealthyChecks == null &&
    forecast.remainingEngWeeks == null
  ) {
    riskTier = "unavailable";
  }

  return {
    projectId: project.id,
    projectName: project.name ?? null,
    projectKey: project.key ?? null,
    clientId: project.client?.id ?? null,
    clientName: project.client?.name ?? null,
    ownerName: ownerName(project),
    owningTeamIds: [],
    owningTeamNames: [],
    state: project.state ?? null,
    budgetBurnPct,
    billableRemainingHours,
    runwayDays,
    scheduleSlipDays,
    remainingEngWeeks: forecast.remainingEngWeeks,
    staffingGapEngWeeks: forecast.staffingGapEngWeeks,
    staffingAsk: forecast.staffingAsk,
    forecastConfidence: forecast.forecastConfidence,
    unhealthyChecks,
    healthy: typeof project.healthy === "boolean" ? project.healthy : null,
    riskTier,
    riskReasons,
  };
}

function applyOwnership(
  projects: PortfolioProjectRow[],
  ownerships: Array<{
    teamId: string;
    teamName: string;
    clientId: string;
    projectId: string;
  }>,
): PortfolioProjectRow[] {
  return projects.map((project) => {
    const matched = ownerships.filter((o) => {
      if (o.projectId && o.projectId === project.projectId) return true;
      if (
        !o.projectId &&
        project.clientId &&
        o.clientId === project.clientId
      ) {
        return true;
      }
      return false;
    });
    if (matched.length === 0) return project;
    const ids = [...new Set(matched.map((m) => m.teamId))];
    const names = [...new Set(matched.map((m) => m.teamName))];
    return {
      ...project,
      owningTeamIds: ids,
      owningTeamNames: names,
    };
  });
}

async function listAllActiveProjects(
  client: BitmapApiClient,
): Promise<BitmapProject[]> {
  const all: BitmapProject[] = [];
  let page = 1;
  for (let i = 0; i < 20; i += 1) {
    const res = await client.listProjectsForDiscovery({
      status: "active",
      page,
    });
    all.push(...(res.data ?? []));
    if (!res.next_page || (res.data?.length ?? 0) === 0) break;
    page = res.next_page;
  }
  return all;
}

export class PortfolioService {
  constructor(
    private readonly settings: SettingsService,
    private readonly syncs: WorklogSyncsRepository,
    private readonly teams: TeamsRepository,
  ) {}

  private async loadRecentTimesheets(
    client: BitmapApiClient,
    now: Date,
  ): Promise<Map<string, BitmapTimesheetEntry[]>> {
    const endDate = now.toISOString().slice(0, 10);
    const start = new Date(
      now.getTime() - RECENT_BURN_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    try {
      const entries = await client.listTimesheetEntries({
        startDate: start.toISOString().slice(0, 10),
        endDate,
      });
      return groupTimesheetsByProjectId(entries);
    } catch {
      return new Map();
    }
  }

  async getPortfolio(options?: {
    clientId?: string | null;
    riskTier?: PortfolioRiskTier | null;
    owner?: string | null;
    teamId?: string | null;
    /** When true, restrict to teams the given app user belongs to. */
    mineForUserId?: string | null;
    thresholds?: AlertThresholds;
  }): Promise<PortfolioResult> {
    const thresholds =
      options?.thresholds ?? (await this.settings.getAlertThresholds());
    const generatedAt = new Date().toISOString();
    const now = new Date();

    let syncFailedOpen = 0;
    try {
      const open = await this.syncs.dashboardOpenCounts({ type: "all" });
      for (const row of open) {
        if (row.status === "failed") syncFailedOpen = Number(row.count ?? 0);
      }
    } catch {
      syncFailedOpen = 0;
    }

    let mineTeamIds: string[] | null = null;
    if (options?.mineForUserId) {
      try {
        mineTeamIds = await this.teams.listTeamIdsForAppUser(
          options.mineForUserId,
        );
      } catch {
        mineTeamIds = [];
      }
    }

    try {
      const bitmap = await this.settings.createConfiguredBitmapClient();
      const tokenOk = await this.settings.isTokenConfigured();
      if (!tokenOk) {
        return {
          generatedAt,
          summary: emptyPortfolioSummary(),
          projects: [],
          syncFailedOpen,
          error: "Bitmap access token is not configured",
        };
      }

      const raw = withoutExcludedClientProjects(
        await listAllActiveProjects(bitmap),
      );
      const inWindow = raw.filter((p) => isProjectInPortfolioWindow(p, now));
      const timesheetsByProject = await this.loadRecentTimesheets(bitmap, now);
      let projects = inWindow.map((p) =>
        scorePortfolioProject(p, thresholds, {
          timesheets: timesheetsByProject.get(p.id) ?? [],
          now,
        }),
      );

      try {
        const ownerships = await this.teams.listOwnershipsWithTeamNames();
        projects = applyOwnership(projects, ownerships);
      } catch {
        // Ownership table may not exist yet on older deploys; keep rows unowned.
      }

      projects.sort((a, b) => {
        const rank = (t: PortfolioRiskTier) =>
          t === "risk" ? 0 : t === "watch" ? 1 : t === "ok" ? 2 : 3;
        const d = rank(a.riskTier) - rank(b.riskTier);
        if (d !== 0) return d;
        return (b.budgetBurnPct ?? -1) - (a.budgetBurnPct ?? -1);
      });

      return filterPortfolioResult(
        {
          generatedAt,
          summary: summarisePortfolio(projects),
          projects,
          syncFailedOpen,
          error: null,
        },
        {
          clientId: options?.clientId,
          riskTier: options?.riskTier,
          owner: options?.owner,
          teamId: options?.teamId,
          teamIds: mineTeamIds,
        },
      );
    } catch (err) {
      return {
        generatedAt,
        summary: emptyPortfolioSummary(),
        projects: [],
        syncFailedOpen,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export function createPortfolioService(
  db: Db = getDb(),
  settings: SettingsService = createSettingsService(db),
) {
  return new PortfolioService(
    settings,
    new WorklogSyncsRepository(db),
    new TeamsRepository(db),
  );
}
