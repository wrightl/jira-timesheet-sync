import { withoutExcludedClientRows } from "@/lib/excluded-clients";

export type PortfolioRiskTier = "ok" | "watch" | "risk" | "unavailable";

export type PortfolioProjectRow = {
  projectId: string;
  projectName: string | null;
  projectKey: string | null;
  clientId: string | null;
  clientName: string | null;
  ownerName: string | null;
  state: string | null;
  budgetBurnPct: number | null;
  billableRemainingHours: number | null;
  runwayDays: number | null;
  scheduleSlipDays: number | null;
  unhealthyChecks: number | null;
  healthy: boolean | null;
  riskTier: PortfolioRiskTier;
  riskReasons: string[];
};

export type PortfolioSummary = {
  projectCount: number;
  riskCount: number;
  watchCount: number;
  okCount: number;
  avgBudgetBurnPct: number | null;
};

export type PortfolioResult = {
  generatedAt: string;
  summary: PortfolioSummary;
  projects: PortfolioProjectRow[];
  syncFailedOpen: number;
  error: string | null;
};

export type PortfolioViewFilters = {
  clientId?: string | null;
  riskTier?: PortfolioRiskTier | "all" | null;
  owner?: string | null;
};

/** Minimal project shape needed for the portfolio date window. */
export type PortfolioDateWindowProject = {
  start_date?: string | null;
  end_date?: string | null;
};

export function emptyPortfolioSummary(): PortfolioSummary {
  return {
    projectCount: 0,
    riskCount: 0,
    watchCount: 0,
    okCount: 0,
    avgBudgetBurnPct: null,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** YYYY-MM-DD from a Date or date-like string (calendar day, UTC). */
function toCalendarDate(value: string | Date): string | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Prefer leading YYYY-MM-DD when present (Bitmap dates are typically this).
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (match) return match[1];
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

/**
 * True when today falls inside [start_date, end_date] (inclusive calendar days).
 * Missing start_date → exclude. Missing end_date → treat as open-ended.
 */
export function isProjectInPortfolioWindow(
  project: PortfolioDateWindowProject,
  today: Date = new Date(),
): boolean {
  const todayKey = toCalendarDate(today);
  if (!todayKey) return false;

  const startKey = project.start_date
    ? toCalendarDate(project.start_date)
    : null;
  if (!startKey || startKey > todayKey) return false;

  if (!project.end_date) return true;
  const endKey = toCalendarDate(project.end_date);
  if (!endKey) return true;
  return endKey >= todayKey;
}

export function summarisePortfolio(
  projects: PortfolioProjectRow[],
): PortfolioSummary {
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

/** Apply client / risk / owner filters and recompute summary. */
export function filterPortfolioResult(
  result: PortfolioResult,
  filters: PortfolioViewFilters = {},
): PortfolioResult {
  let projects = withoutExcludedClientRows(result.projects);
  const clientId = filters.clientId?.trim();
  if (clientId && clientId !== "all") {
    projects = projects.filter((p) => p.clientId === clientId);
  }
  const owner = filters.owner?.trim().toLowerCase();
  if (owner) {
    projects = projects.filter((p) =>
      (p.ownerName ?? "").toLowerCase().includes(owner),
    );
  }
  const tier = filters.riskTier;
  if (tier && tier !== "all") {
    projects = projects.filter((p) => p.riskTier === tier);
  }
  return {
    ...result,
    projects,
    summary: summarisePortfolio(projects),
  };
}
