import { describe, expect, it } from "vitest";
import type { BitmapProject } from "@/clients/bitmap-http";
import {
  computeBudgetBurnPct,
  estimateRunwayDays,
  scorePortfolioProject,
} from "@/services/portfolio-service";

describe("portfolio scoring", () => {
  it("computes budget burn from time fields", () => {
    expect(
      computeBudgetBurnPct({
        time_budgeted: 100,
        time_logged: 40,
      }),
    ).toBe(40);
  });

  it("marks a project as risk only when Jira remaining exceeds budget", () => {
    const project: BitmapProject = {
      id: "p1",
      name: "Alpha",
      time_budgeted: 100,
      time_logged: 95,
      time_remaining: 12.5,
      jira_budget_remaining_effort: 60,
      billable_time_remaining: 2,
      start_date: "2026-01-01",
      end_date: "2026-08-01",
      forecast_end_date: "2026-08-20",
      unhealthy_checks: 0,
      healthy: true,
      client: { id: "c1", name: "Acme" },
      tech_lead: { full_name: "Lee" },
    };
    const row = scorePortfolioProject(project);
    expect(row.estimateDeltaHours).toBe(47.5);
    expect(row.riskTier).toBe("risk");
    expect(row.healthy).toBe(false);
    expect(row.ownerName).toBe("Lee");
    expect(row.riskReasons[0]).toContain("Jira remaining exceeds budget");
    expect(row.remainingEngWeeks).toBe(0.1);
    expect(row.staffingAsk).toBeTruthy();
  });

  it("does not class high burn or late forecast as risk without a positive estimate delta", () => {
    const project: BitmapProject = {
      id: "p1",
      name: "Alpha",
      time_budgeted: 100,
      time_logged: 95,
      time_remaining: 40,
      jira_budget_remaining_effort: 10,
      billable_time_remaining: 2,
      start_date: "2026-01-01",
      end_date: "2026-08-01",
      forecast_end_date: "2026-08-20",
      unhealthy_checks: 4,
      healthy: false,
      client: { id: "c1", name: "Acme" },
    };
    const row = scorePortfolioProject(project);
    expect(row.estimateDeltaHours).toBe(-30);
    expect(row.riskTier).toBe("ok");
    expect(row.healthy).toBe(true);
    expect(row.riskReasons).toEqual([]);
  });

  it("is unavailable when estimate delta cannot be computed", () => {
    const row = scorePortfolioProject({
      id: "p3",
      name: "Gamma",
      time_budgeted: 100,
      time_logged: 95,
    });
    expect(row.estimateDeltaHours).toBeNull();
    expect(row.riskTier).toBe("unavailable");
    expect(row.healthy).toBeNull();
  });

  it("includes staffing ask when remaining work exceeds end-date capacity", () => {
    const end = new Date();
    end.setUTCDate(end.getUTCDate() + 7);
    const endDate = end.toISOString().slice(0, 10);
    const project: BitmapProject = {
      id: "p2",
      name: "Beta",
      time_budgeted: 200,
      time_logged: 40,
      billable_time_remaining: 160,
      start_date: "2026-07-01",
      end_date: endDate,
      healthy: true,
      unhealthy_checks: 0,
      client: { id: "c1", name: "Acme" },
    };
    const row = scorePortfolioProject(project);
    expect(row.remainingEngWeeks).toBe(5.3);
    expect(row.staffingGapEngWeeks).toBeGreaterThan(0);
    expect(row.staffingAsk).toMatch(/Need \+/);
  });

  it("estimates runway from remaining hours", () => {
    const days = estimateRunwayDays({
      project: {
        billable_time_remaining: 30,
        billable_time_used: 60,
        start_date: "2026-07-01",
      },
    });
    expect(days).not.toBeNull();
    expect(days!).toBeGreaterThan(0);
  });

  it("prefers billable_time_used over time_logged for burn", () => {
    expect(
      computeBudgetBurnPct({
        time_budgeted: 100,
        time_logged: 90,
        billable_time_used: 40,
      }),
    ).toBe(40);
  });
});
