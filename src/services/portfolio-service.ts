import type { BitmapApiClient, BitmapProject } from "@/clients/bitmap-http";
import type {
  PortfolioProjectRow,
  PortfolioResult,
  PortfolioRiskTier,
  PortfolioSummary,
} from "@/lib/portfolio";
import {
  DEFAULT_ALERT_THRESHOLDS,
  type AlertThresholds,
} from "@/lib/alert-thresholds";
import { WorklogSyncsRepository } from "@/repositories/worklog-syncs-repository";
import {
  createSettingsService,
  type SettingsService,
} from "@/services/settings-service";
import { getDb, type Db } from "@/db";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pct(numer: number | null | undefined, denom: number | null | undefined): number | null {
  if (
    numer == null ||
    denom == null ||
    !Number.isFinite(numer) ||
    !Number.isFinite(denom) ||
    denom <= 0
  ) {
    return null;
  }
  return round1((numer / denom) * 100);
}

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

export function computeBudgetBurnPct(project: BitmapProject): number | null {
  const budgeted = project.time_budgeted;
  const logged = project.time_logged;
  if (budgeted != null && budgeted > 0 && logged != null) {
    return pct(logged, budgeted);
  }
  const billableUsed = project.billable_time_used;
  const billableRemaining = project.billable_time_remaining;
  if (
    billableUsed != null &&
    billableRemaining != null &&
    billableUsed + billableRemaining > 0
  ) {
    return pct(billableUsed, billableUsed + billableRemaining);
  }
  return null;
}

export function estimateRunwayDays(project: BitmapProject): number | null {
  const remaining =
    project.billable_time_remaining ?? project.time_remaining ?? null;
  if (remaining == null || !Number.isFinite(remaining) || remaining < 0) {
    return null;
  }
  const logged = project.billable_time_used ?? project.time_logged ?? null;
  const start = project.start_date ? Date.parse(project.start_date) : NaN;
  const now = Date.now();
  if (logged != null && logged > 0 && Number.isFinite(start) && now > start) {
    const elapsedDays = Math.max(
      1,
      (now - start) / (24 * 60 * 60 * 1000),
    );
    const daily = logged / elapsedDays;
    if (daily > 0) return round1(remaining / daily);
  }
  // Fallback: assume ~6 billable hours/day
  return round1(remaining / 6);
}

export function scorePortfolioProject(
  project: BitmapProject,
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS,
): PortfolioProjectRow {
  const budgetBurnPct = computeBudgetBurnPct(project);
  const runwayDays = estimateRunwayDays(project);
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
  } else if (budgetBurnPct != null && budgetBurnPct >= 85) {
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

  if (
    budgetBurnPct == null &&
    runwayDays == null &&
    scheduleSlipDays == null &&
    unhealthyChecks == null
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
    state: project.state ?? null,
    budgetBurnPct,
    billableRemainingHours:
      project.billable_time_remaining ?? project.time_remaining ?? null,
    runwayDays,
    scheduleSlipDays,
    unhealthyChecks,
    healthy: typeof project.healthy === "boolean" ? project.healthy : null,
    riskTier,
    riskReasons,
  };
}

function summarize(projects: PortfolioProjectRow[]): PortfolioSummary {
  let riskCount = 0;
  let watchCount = 0;
  let okCount = 0;
  let burnSum = 0;
  let burnN = 0;
  for (const p of projects) {
    if (p.riskTier === "risk") riskCount += 1;
    else if (p.riskTier === "watch") watchCount += 1;
    else if (p.riskTier === "ok") okCount += 1;
    if (p.budgetBurnPct != null) {
      burnSum += p.budgetBurnPct;
      burnN += 1;
    }
  }
  return {
    projectCount: projects.length,
    riskCount,
    watchCount,
    okCount,
    avgBudgetBurnPct: burnN > 0 ? round1(burnSum / burnN) : null,
  };
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
  ) {}

  async getPortfolio(options?: {
    clientId?: string | null;
    riskTier?: PortfolioRiskTier | null;
    owner?: string | null;
    thresholds?: AlertThresholds;
  }): Promise<PortfolioResult> {
    const thresholds = options?.thresholds ?? DEFAULT_ALERT_THRESHOLDS;
    const generatedAt = new Date().toISOString();

    let syncFailedOpen = 0;
    try {
      const open = await this.syncs.dashboardOpenCounts({ type: "all" });
      for (const row of open) {
        if (row.status === "failed") syncFailedOpen = Number(row.count ?? 0);
      }
    } catch {
      syncFailedOpen = 0;
    }

    try {
      const bitmap = await this.settings.createConfiguredBitmapClient();
      const tokenOk = await this.settings.isTokenConfigured();
      if (!tokenOk) {
        return {
          generatedAt,
          summary: {
            projectCount: 0,
            riskCount: 0,
            watchCount: 0,
            okCount: 0,
            avgBudgetBurnPct: null,
          },
          projects: [],
          syncFailedOpen,
          error: "Bitmap access token is not configured",
        };
      }

      const raw = await listAllActiveProjects(bitmap);
      let projects = raw.map((p) => scorePortfolioProject(p, thresholds));

      const clientId = options?.clientId?.trim();
      if (clientId) {
        projects = projects.filter((p) => p.clientId === clientId);
      }
      const owner = options?.owner?.trim().toLowerCase();
      if (owner) {
        projects = projects.filter((p) =>
          (p.ownerName ?? "").toLowerCase().includes(owner),
        );
      }
      const tier = options?.riskTier;
      if (tier) {
        projects = projects.filter((p) => p.riskTier === tier);
      }

      projects.sort((a, b) => {
        const rank = (t: PortfolioRiskTier) =>
          t === "risk" ? 0 : t === "watch" ? 1 : t === "ok" ? 2 : 3;
        const d = rank(a.riskTier) - rank(b.riskTier);
        if (d !== 0) return d;
        return (b.budgetBurnPct ?? -1) - (a.budgetBurnPct ?? -1);
      });

      return {
        generatedAt,
        summary: summarize(projects),
        projects,
        syncFailedOpen,
        error: null,
      };
    } catch (err) {
      return {
        generatedAt,
        summary: {
          projectCount: 0,
          riskCount: 0,
          watchCount: 0,
          okCount: 0,
          avgBudgetBurnPct: null,
        },
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
  return new PortfolioService(settings, new WorklogSyncsRepository(db));
}
