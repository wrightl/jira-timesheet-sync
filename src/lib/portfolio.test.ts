import { describe, expect, it } from "vitest";
import {
  filterPortfolioResult,
  isProjectInPortfolioWindow,
  summarisePortfolio,
  type PortfolioProjectRow,
  type PortfolioResult,
} from "@/lib/portfolio";

const TODAY = new Date("2026-08-13T12:00:00.000Z");

function row(
  overrides: Partial<PortfolioProjectRow> & Pick<PortfolioProjectRow, "projectId">,
): PortfolioProjectRow {
  return {
    projectName: overrides.projectId,
    projectKey: overrides.projectId,
    clientId: "c1",
    clientName: "Acme",
    ownerName: "Lee",
    state: "active",
    budgetBurnPct: 10,
    billableRemainingHours: 20,
    runwayDays: 12,
    scheduleSlipDays: 0,
    unhealthyChecks: 0,
    healthy: true,
    riskTier: "ok",
    riskReasons: [],
    ...overrides,
  };
}

function result(projects: PortfolioProjectRow[]): PortfolioResult {
  return {
    generatedAt: "2026-08-13T12:00:00.000Z",
    summary: summarisePortfolio(projects),
    projects,
    syncFailedOpen: 2,
    error: null,
  };
}

describe("summarisePortfolio", () => {
  it("counts risk tiers and averages burn", () => {
    const summary = summarisePortfolio([
      row({ projectId: "a", riskTier: "risk", budgetBurnPct: 90 }),
      row({ projectId: "b", riskTier: "watch", budgetBurnPct: 50 }),
      row({ projectId: "c", riskTier: "ok", budgetBurnPct: 10 }),
    ]);
    expect(summary).toEqual({
      projectCount: 3,
      riskCount: 1,
      watchCount: 1,
      okCount: 1,
      avgBudgetBurnPct: 50,
    });
  });
});

describe("filterPortfolioResult", () => {
  const full = result([
    row({ projectId: "a", clientId: "c1", riskTier: "risk", ownerName: "Lee" }),
    row({ projectId: "b", clientId: "c2", riskTier: "ok", ownerName: "Sam Wright" }),
  ]);

  it("filters by client and recomputes summary", () => {
    const filtered = filterPortfolioResult(full, { clientId: "c2" });
    expect(filtered.projects.map((p) => p.projectId)).toEqual(["b"]);
    expect(filtered.summary.projectCount).toBe(1);
    expect(filtered.syncFailedOpen).toBe(2);
  });

  it("filters by risk tier", () => {
    const filtered = filterPortfolioResult(full, { riskTier: "risk" });
    expect(filtered.projects.map((p) => p.projectId)).toEqual(["a"]);
  });

  it("filters owner case-insensitively", () => {
    const filtered = filterPortfolioResult(full, { owner: "sam" });
    expect(filtered.projects.map((p) => p.projectId)).toEqual(["b"]);
  });

  it("treats all as no-op for client and risk", () => {
    const filtered = filterPortfolioResult(full, {
      clientId: "all",
      riskTier: "all",
    });
    expect(filtered.projects).toHaveLength(2);
  });

  it("always drops TheCurve even when the filter is all", () => {
    const withInternal = result([
      ...full.projects,
      row({
        projectId: "internal",
        clientId: "5e8f8b80d9f37277a88e7f10",
        clientName: "TheCurve",
        riskTier: "ok",
      }),
    ]);
    const filtered = filterPortfolioResult(withInternal, { clientId: "all" });
    expect(filtered.projects.map((p) => p.projectId)).toEqual(["a", "b"]);
    expect(filtered.summary.projectCount).toBe(2);
  });
});

describe("isProjectInPortfolioWindow", () => {
  it("includes projects spanning today", () => {
    expect(
      isProjectInPortfolioWindow(
        { start_date: "2026-08-12", end_date: "2026-08-14" },
        TODAY,
      ),
    ).toBe(true);
  });

  it("includes when start and end equal today", () => {
    expect(
      isProjectInPortfolioWindow(
        { start_date: "2026-08-13", end_date: "2026-08-13" },
        TODAY,
      ),
    ).toBe(true);
  });

  it("excludes upcoming projects (start in the future)", () => {
    expect(
      isProjectInPortfolioWindow(
        { start_date: "2026-08-14", end_date: "2026-09-01" },
        TODAY,
      ),
    ).toBe(false);
  });

  it("excludes projects whose end is in the past", () => {
    expect(
      isProjectInPortfolioWindow(
        { start_date: "2026-07-01", end_date: "2026-08-12" },
        TODAY,
      ),
    ).toBe(false);
  });

  it("excludes projects with missing start_date", () => {
    expect(
      isProjectInPortfolioWindow({ start_date: null, end_date: "2026-09-01" }, TODAY),
    ).toBe(false);
    expect(
      isProjectInPortfolioWindow({ end_date: "2026-09-01" }, TODAY),
    ).toBe(false);
  });

  it("includes open-ended projects with start already passed", () => {
    expect(
      isProjectInPortfolioWindow(
        { start_date: "2026-08-01", end_date: null },
        TODAY,
      ),
    ).toBe(true);
    expect(
      isProjectInPortfolioWindow({ start_date: "2026-08-01" }, TODAY),
    ).toBe(true);
  });
});
