import { describe, expect, it } from "vitest";
import {
  LOW_PROFITABILITY_PCT,
  ProfitabilityQueryError,
  assertProfitabilityDateRange,
  compareProjectProfitability,
  profitabilityPct,
  resolveClientDayRate,
  scoreClosedProject,
  summariseProfitability,
  type ProjectProfitability,
  type RoleRate,
} from "@/lib/profitability";

const rates: RoleRate[] = [
  { roleName: "Senior Engineer", dayRateCost: 450 },
  { roleName: "Project Manager", dayRateCost: 500 },
];

describe("profitability", () => {
  it("divides amount charged by role cost", () => {
    const row = scoreClosedProject({
      projectId: "p1",
      projectName: "Atlas",
      clientId: "c1",
      clientName: "Acme",
      endDate: "2026-03-31",
      roleRates: rates,
      budgets: [
        {
          id: "b1",
          dayRate: 900,
          billableDefault: true,
          weightHours: 80,
        },
      ],
      entries: [
        {
          hours: 7.5,
          billable: true,
          state: "approved",
          jobTitle: "senior engineer",
          projectBudgetId: "b1",
          budgetDayRate: null,
        },
      ],
    });

    expect(row.charged).toBe(900);
    expect(row.cost).toBe(450);
    expect(row.profitabilityPct).toBe(200);
    expect(row.belowThreshold).toBe(false);
    expect(row.billableHours).toBe(7.5);
  });

  it("counts non-billable time as cost with no charge", () => {
    const row = scoreClosedProject({
      projectId: "p1",
      projectName: "Atlas",
      clientId: "c1",
      clientName: "Acme",
      endDate: "2026-03-31",
      roleRates: rates,
      budgets: [
        { id: "b1", dayRate: 900, billableDefault: true, weightHours: 10 },
      ],
      entries: [
        {
          hours: 7.5,
          billable: true,
          state: "approved",
          jobTitle: "Senior Engineer",
          projectBudgetId: null,
          budgetDayRate: null,
        },
        {
          hours: 7.5,
          billable: false,
          state: "approved",
          jobTitle: "Senior Engineer",
          projectBudgetId: null,
          budgetDayRate: null,
        },
        {
          hours: 7.5,
          billable: null,
          state: "approved",
          jobTitle: "Senior Engineer",
          projectBudgetId: null,
          budgetDayRate: null,
        },
      ],
    });

    expect(row.charged).toBe(900);
    expect(row.cost).toBe(900);
    expect(row.profitabilityPct).toBe(100);
    expect(row.hours).toBe(15);
  });

  it("omits unrated roles and treats exactly 20% as on the floor", () => {
    const row = scoreClosedProject({
      projectId: "p2",
      projectName: "Beacon",
      clientId: "c1",
      clientName: "Acme",
      endDate: "2026-04-01",
      roleRates: rates,
      budgets: [
        { id: "b1", dayRate: 100, billableDefault: true, weightHours: 10 },
      ],
      entries: [
        {
          hours: 15,
          billable: true,
          state: "submitted",
          jobTitle: "Project Manager",
          projectBudgetId: "b1",
          budgetDayRate: null,
        },
        {
          hours: 7.5,
          billable: true,
          state: "approved",
          jobTitle: "Intern",
          projectBudgetId: "b1",
          budgetDayRate: null,
        },
        {
          hours: 4,
          billable: true,
          state: "planned",
          jobTitle: "Project Manager",
          projectBudgetId: "b1",
          budgetDayRate: null,
        },
      ],
    });

    // 2 days of PM at £500 cost and £100 charge → 20% exactly, not below.
    expect(row.cost).toBe(1000);
    expect(row.charged).toBe(200);
    expect(row.profitabilityPct).toBe(20);
    expect(row.belowThreshold).toBe(false);
    expect(row.unratedHours).toBe(7.5);
    expect(row.missingRoles).toEqual(["Intern"]);
  });

  it("treats profitability under the threshold as below 20%", () => {
    const pct = profitabilityPct(90, 500);
    expect(pct).toBe(18);
    expect(pct).toBeLessThan(LOW_PROFITABILITY_PCT);
  });

  it("blends distinct client day rates when a line has no budget", () => {
    const resolved = resolveClientDayRate(
      [
        { id: "a", dayRate: 600, billableDefault: false, weightHours: 10 },
        { id: "b", dayRate: 900, billableDefault: false, weightHours: 30 },
      ],
      { projectBudgetId: null, budgetDayRate: null, billable: true },
    );
    expect(resolved.blended).toBe(true);
    expect(resolved.rate).toBe(825);
  });

  it("summarises average, overall, and the below-threshold count", () => {
    const healthy = scoreClosedProject({
      projectId: "p1",
      projectName: "Atlas",
      clientId: "c1",
      clientName: "Acme",
      endDate: "2026-03-01",
      roleRates: rates,
      budgets: [
        { id: "b1", dayRate: 900, billableDefault: true, weightHours: 8 },
      ],
      entries: [
        {
          hours: 7.5,
          billable: true,
          state: null,
          jobTitle: "Senior Engineer",
          projectBudgetId: "b1",
          budgetDayRate: null,
        },
      ],
    });
    const thin = scoreClosedProject({
      projectId: "p2",
      projectName: "Beacon",
      clientId: "c1",
      clientName: "Acme",
      endDate: "2026-03-02",
      roleRates: rates,
      budgets: [
        { id: "b1", dayRate: 50, billableDefault: true, weightHours: 8 },
      ],
      entries: [
        {
          hours: 7.5,
          billable: true,
          state: null,
          jobTitle: "Senior Engineer",
          projectBudgetId: "b1",
          budgetDayRate: null,
        },
      ],
    });

    const summary = summariseProfitability([healthy, thin]);
    expect(healthy.profitabilityPct).toBe(200);
    expect(thin.profitabilityPct).toBe(11.1);
    expect(thin.belowThreshold).toBe(true);
    expect(summary.averageProfitabilityPct).toBe(105.6);
    expect(summary.medianProfitabilityPct).toBe(105.6);
    expect(summary.overallProfitabilityPct).toBe(105.6);
    expect(summary.belowThresholdCount).toBe(1);
    expect(summary.grossProfit).toBe(50);
    expect(summary.totalCharged).toBe(950);
    expect(summary.totalCost).toBe(900);
  });

  it("sorts the weakest projects first and keeps unscored rows last", () => {
    const rows = [
      { projectName: "Zed", profitabilityPct: 80 },
      { projectName: "Amy", profitabilityPct: null },
      { projectName: "Bea", profitabilityPct: 10 },
    ] as ProjectProfitability[];
    expect([...rows].sort(compareProjectProfitability).map((row) => row.projectName)).toEqual([
      "Bea",
      "Zed",
      "Amy",
    ]);
  });

  it("rejects an inverted or invalid date range", () => {
    expect(() => assertProfitabilityDateRange("2026-02-01", "2026-01-01")).toThrow(
      ProfitabilityQueryError,
    );
    expect(() => assertProfitabilityDateRange("01-01-2026", "2026-02-01")).toThrow(
      ProfitabilityQueryError,
    );
    expect(() =>
      assertProfitabilityDateRange("2026-01-01", "2026-03-31"),
    ).not.toThrow();
  });
});
