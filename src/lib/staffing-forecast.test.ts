import { describe, expect, it } from "vitest";
import {
  computeStaffingForecast,
  staffingGapStatus,
} from "@/lib/staffing-forecast";

describe("computeStaffingForecast", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  it("computes eng-week gap vs end date at 1 FTE", () => {
    // 60h = 2 eng-weeks (30h); 7 days left ≈ 1 eng-week capacity → gap 1
    const forecast = computeStaffingForecast({
      remainingHours: 60,
      endDate: "2026-08-20",
      now,
      hasJiraRemainingEffort: true,
      estimateCoveragePct: 95,
    });
    expect(forecast.remainingEngWeeks).toBe(2);
    expect(forecast.daysToTarget).toBe(7);
    expect(forecast.staffingGapEngWeeks).toBe(1);
    expect(forecast.staffingAsk).toBe("Need +1 eng-weeks by 2026-08-20");
    expect(forecast.forecastConfidence).toBe("high");
  });

  it("uses 30 billable hours per eng-week", () => {
    const forecast = computeStaffingForecast({
      remainingHours: 30,
      now: new Date("2026-08-13T12:00:00.000Z"),
    });
    expect(forecast.remainingEngWeeks).toBe(1);
  });

  it("reports on track when capacity covers remaining work", () => {
    const forecast = computeStaffingForecast({
      remainingHours: 20,
      endDate: "2026-09-10",
      now,
    });
    expect(forecast.staffingGapEngWeeks).toBe(0);
    expect(forecast.staffingAsk).toContain("On track");
    expect(forecast.forecastConfidence).toBe("low");
  });

  it("treats past end dates with remaining work as full gap", () => {
    const forecast = computeStaffingForecast({
      remainingHours: 30,
      endDate: "2026-08-01",
      now,
    });
    expect(forecast.daysToTarget).toBeLessThan(0);
    expect(forecast.staffingGapEngWeeks).toBe(1);
  });
});

describe("staffingGapStatus", () => {
  it("maps gaps to metric statuses", () => {
    expect(staffingGapStatus(null)).toBe("unavailable");
    expect(staffingGapStatus(0)).toBe("ok");
    expect(staffingGapStatus(0.5)).toBe("watch");
    expect(staffingGapStatus(2)).toBe("risk");
  });
});
