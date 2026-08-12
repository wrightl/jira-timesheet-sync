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
