import { describe, expect, it } from "vitest";
import {
  computeEstimateDeltaHours,
  estimateDeltaFromBitmapProject,
  estimateDeltaStatus,
  scoreEstimateDeltaHealth,
} from "@/lib/estimate-delta";

describe("estimate delta health", () => {
  it("computes remaining Jira effort minus remaining budget", () => {
    expect(computeEstimateDeltaHours(60, 12.5)).toBe(47.5);
    expect(computeEstimateDeltaHours(10, 10)).toBe(0);
    expect(computeEstimateDeltaHours(8, 16)).toBe(-8);
    expect(computeEstimateDeltaHours(null, 16, 3)).toBe(3);
    expect(computeEstimateDeltaHours(null, null)).toBeNull();
  });

  it("reads Bitmap remaining effort and budget, then stored delta", () => {
    expect(
      estimateDeltaFromBitmapProject({
        jira_budget_remaining_effort: 60,
        time_remaining: 12.5,
      }),
    ).toBe(47.5);
    expect(
      estimateDeltaFromBitmapProject({
        jira_budget_remaining_effort: 20,
        billable_time_remaining: 30,
      }),
    ).toBe(-10);
    expect(
      estimateDeltaFromBitmapProject({
        remaining_jira_estimates_delta: { hours: 4 },
      }),
    ).toBe(4);
  });

  it("classes a positive delta as risk and zero/negative as healthy", () => {
    expect(scoreEstimateDeltaHealth(47.5)).toMatchObject({
      status: "risk",
      riskTier: "risk",
      healthy: false,
    });
    expect(scoreEstimateDeltaHealth(0)).toMatchObject({
      status: "ok",
      riskTier: "ok",
      healthy: true,
      riskReasons: [],
    });
    expect(scoreEstimateDeltaHealth(-8)).toMatchObject({
      status: "ok",
      healthy: true,
    });
    expect(scoreEstimateDeltaHealth(null)).toMatchObject({
      status: "unavailable",
      riskTier: "unavailable",
      healthy: null,
      riskReasons: [],
    });
    expect(estimateDeltaStatus(0.1)).toBe("risk");
  });
});
