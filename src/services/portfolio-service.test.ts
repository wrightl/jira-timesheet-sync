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
        id: "1",
        time_budgeted: 100,
        time_logged: 40,
      }),
    ).toBe(40);
  });

  it("marks high burn as risk", () => {
    const project: BitmapProject = {
      id: "p1",
      name: "Alpha",
      time_budgeted: 100,
      time_logged: 95,
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
    expect(row.riskTier).toBe("risk");
    expect(row.ownerName).toBe("Lee");
    expect(row.riskReasons.some((r) => r.includes("Budget burn"))).toBe(true);
  });

  it("estimates runway from remaining hours", () => {
    const days = estimateRunwayDays({
      id: "p1",
      billable_time_remaining: 30,
      billable_time_used: 60,
      start_date: "2026-07-01",
    });
    expect(days).not.toBeNull();
    expect(days!).toBeGreaterThan(0);
  });
});
