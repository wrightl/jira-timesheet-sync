import { describe, expect, it } from "vitest";
import {
  burnStatus,
  computeBudgetBurnPct,
  estimateRunwayDays,
} from "@/lib/bitmap-project-metrics";

describe("bitmap project metrics", () => {
  it("computes burn from billable used over budget", () => {
    expect(
      computeBudgetBurnPct({
        time_budgeted: 100,
        billable_time_used: 25,
        time_logged: 80,
      }),
    ).toBe(25);
  });

  it("falls back to time_logged when billable used is missing", () => {
    expect(
      computeBudgetBurnPct({
        time_budgeted: 100,
        time_logged: 40,
      }),
    ).toBe(40);
  });

  it("uses 90% as default burn risk", () => {
    expect(burnStatus(90)).toBe("risk");
    expect(burnStatus(85)).toBe("watch");
    expect(burnStatus(84)).toBe("ok");
  });

  it("matches runway from 14-day timesheets on portfolio and projects", () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    const project = {
      billable_time_remaining: 12,
      start_date: "2026-01-01",
      billable_time_used: 400,
    };
    const timesheets = [
      { date: "2026-08-08", hours: 6, billable: true },
      { date: "2026-08-07", hours: 6, billable: true },
    ];
    expect(
      estimateRunwayDays({ project, timesheets, now }),
    ).toBe(2);
  });
});
