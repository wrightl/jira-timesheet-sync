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
  estimateDeltaFromBitmapProject,
  scoreEstimateDeltaHealth,
} from "@/lib/estimate-delta";
import { utcWeekdayDiffDays } from "@/lib/weekday-hours";
import {
  computeStaffingForecast,
} from "@/lib/staffing-forecast";
import { withoutExcludedClientProjects } from "@/lib/excluded-clients";
import {
  DEFAULT_ALERT_THRESHOLDS,
  type AlertThresholds,
} from "@/lib/alert-thresholds";
import {
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
  return utcWeekdayDiffDays(a, b);
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
  _thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS,
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

  const estimateDeltaHours = estimateDeltaFromBitmapProject(project);
  const estimateHealth = scoreEstimateDeltaHealth(estimateDeltaHours);

  const billableRemainingHours = remainingHoursOnProject(project);
  const forecast = computeStaffingForecast({
    remainingHours: billableRemainingHours,
    endDate: project.end_date,
    forecastEndDate: project.forecast_end_date,
    hasJiraRemainingEffort:
      typeof project.jira_budget_remaining_effort === "number",
  });

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
    estimateDeltaHours,
    unhealthyChecks,
    healthy: estimateHealth.healthy,
    riskTier: estimateHealth.riskTier,
    riskReasons: estimateHealth.riskReasons,
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
