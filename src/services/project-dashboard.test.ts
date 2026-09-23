import { describe, expect, it } from "vitest";
import type { BitmapBurndown, BitmapTimesheetEntry } from "@/clients/bitmap-http";
import {
  allocationUtilisationStatus,
  avgDailyBillableBurnHours,
  billableMixStatus,
  burndownRemainingSlipHours,
  calendarElapsedPct,
  computeEstimateDeltaHours,
  defectInjectionStatus,
  estimateDeltaStatus,
  healthCheckScoreStatus,
  paceStatus,
  remainingHoursSlipStatus,
  runwayDaysStatus,
  ageingWipStatus,
  throughputStatus,
} from "@/services/project-dashboard";

describe("project-dashboard metric helpers", () => {
  it("computes calendar elapsed percent clamped to 0–100", () => {
    const now = new Date("2026-08-09T00:00:00.000Z");
    expect(
      calendarElapsedPct("2026-08-01T00:00:00.000Z", "2026-08-17T00:00:00.000Z", now),
    ).toBe(50);
    expect(calendarElapsedPct(null, "2026-08-17", now)).toBeNull();
    expect(
      calendarElapsedPct("2026-01-01", "2026-02-01", now),
    ).toBe(100);
  });

  it("applies pace / mix / allocation status thresholds", () => {
    expect(paceStatus(16)).toBe("risk");
    expect(paceStatus(6)).toBe("watch");
    expect(paceStatus(-2)).toBe("ok");
    expect(allocationUtilisationStatus(120)).toBe("risk");
    expect(allocationUtilisationStatus(50)).toBe("watch");
    expect(billableMixStatus(60)).toBe("risk");
    expect(billableMixStatus(80)).toBe("watch");
    expect(billableMixStatus(90)).toBe("ok");
  });

  it("applies defect / throughput / ageing / runway / slip / health statuses", () => {
    expect(defectInjectionStatus(1)).toBe("risk");
    expect(defectInjectionStatus(0.5)).toBe("watch");
    expect(throughputStatus(0, 5)).toBe("watch");
    expect(throughputStatus(2, 5)).toBe("ok");
    expect(ageingWipStatus(10)).toBe("risk");
    expect(ageingWipStatus(5)).toBe("watch");
    expect(runwayDaysStatus(4)).toBe("risk");
    expect(runwayDaysStatus(8)).toBe("watch");
    expect(remainingHoursSlipStatus(16)).toBe("risk");
    expect(remainingHoursSlipStatus(8)).toBe("watch");
    expect(healthCheckScoreStatus(3)).toBe("risk");
    expect(healthCheckScoreStatus(1)).toBe("watch");
    expect(healthCheckScoreStatus(0)).toBe("ok");
  });

  it("computes estimate delta as remaining Jira effort minus remaining budget", () => {
    expect(computeEstimateDeltaHours(60, 12.5)).toBe(47.5);
    expect(computeEstimateDeltaHours(10, 10)).toBe(0);
    expect(computeEstimateDeltaHours(8, 16)).toBe(-8);
    expect(computeEstimateDeltaHours(null, 16, 3)).toBe(3);
    expect(computeEstimateDeltaHours(null, null)).toBeNull();
  });

  it("treats a positive estimate delta as risk and zero/negative as healthy", () => {
    expect(estimateDeltaStatus(0.1)).toBe("risk");
    expect(estimateDeltaStatus(47.5)).toBe("risk");
    expect(estimateDeltaStatus(0)).toBe("ok");
    expect(estimateDeltaStatus(-0.5)).toBe("ok");
    expect(estimateDeltaStatus(-8)).toBe("ok");
    expect(estimateDeltaStatus(null)).toBe("unavailable");
  });

  it("averages recent billable timesheet burn by day", () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    const timesheets: BitmapTimesheetEntry[] = [
      { date: "2026-08-06", hours: 8, billable: true },
      { date: "2026-08-07", hours: 4, billable: true },
      { date: "2026-08-07", hours: 2, billable: false },
      { date: "2026-08-08", hours: 10, billable: true },
      { date: "2026-07-01", hours: 40, billable: true },
    ];
    expect(avgDailyBillableBurnHours(timesheets, null, now)).toBe(6);
  });

  it("falls back to burndown series for daily burn", () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    const burndown: BitmapBurndown = {
      burndown: [
        { date: "2026-08-03", total: 100 * 3600 },
        { date: "2026-08-07", total: 92 * 3600 },
      ],
    };
    expect(avgDailyBillableBurnHours([], burndown, now)).toBe(2);
  });

  it("computes remaining hours slip from burndown", () => {
    const burndown: BitmapBurndown = {
      burndown: [
        { date: "2026-07-29", total: 95 * 3600 },
        { date: "2026-08-03", total: 100 * 3600 },
        { date: "2026-08-07", total: 110 * 3600 },
      ],
    };
    // 7 weekdays prior to Fri 08-07 is Wed 07-29 (95h) → slip +15h
    expect(burndownRemainingSlipHours(burndown, 7)).toBe(15);
  });
});
