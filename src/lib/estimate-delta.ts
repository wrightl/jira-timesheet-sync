import { formatWorkingDuration } from "@/lib/working-duration";

export type EstimateDeltaStatus = "ok" | "risk" | "unavailable";

export type BitmapEstimateDeltaProject = {
  jira_budget_remaining_effort?: number | null;
  time_remaining?: number | null;
  billable_time_remaining?: number | null;
  remaining_jira_estimates_delta?: { hours?: number | null } | null;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Remaining Jira effort minus remaining project budget. Positive = over budget. */
export function computeEstimateDeltaHours(
  remainingEffortHours: number | null,
  remainingBudgetHours: number | null,
  fallbackDeltaHours: number | null = null,
): number | null {
  if (
    remainingEffortHours != null &&
    Number.isFinite(remainingEffortHours) &&
    remainingBudgetHours != null &&
    Number.isFinite(remainingBudgetHours)
  ) {
    return round2(remainingEffortHours - remainingBudgetHours);
  }
  if (fallbackDeltaHours != null && Number.isFinite(fallbackDeltaHours)) {
    return fallbackDeltaHours;
  }
  return null;
}

export function remainingBudgetHours(
  project: BitmapEstimateDeltaProject,
): number | null {
  return (
    finiteNumber(project.time_remaining) ??
    finiteNumber(project.billable_time_remaining)
  );
}

export function remainingJiraEffortHours(
  project: BitmapEstimateDeltaProject,
): number | null {
  return finiteNumber(project.jira_budget_remaining_effort);
}

export function storedEstimateDeltaHours(
  project: BitmapEstimateDeltaProject,
): number | null {
  return finiteNumber(project.remaining_jira_estimates_delta?.hours);
}

export function estimateDeltaFromBitmapProject(
  project: BitmapEstimateDeltaProject,
): number | null {
  return computeEstimateDeltaHours(
    remainingJiraEffortHours(project),
    remainingBudgetHours(project),
    storedEstimateDeltaHours(project),
  );
}

export function estimateDeltaStatus(
  hours: number | null,
): EstimateDeltaStatus {
  if (hours == null || !Number.isFinite(hours)) return "unavailable";
  if (hours > 0) return "risk";
  return "ok";
}

export function estimateDeltaRiskReason(hours: number | null): string | null {
  const status = estimateDeltaStatus(hours);
  if (status !== "risk" || hours == null) return null;
  return `Jira remaining exceeds budget by ${formatWorkingDuration(hours)}`;
}

export function scoreEstimateDeltaHealth(hours: number | null): {
  hours: number | null;
  status: EstimateDeltaStatus;
  riskTier: EstimateDeltaStatus;
  healthy: boolean | null;
  riskReasons: string[];
} {
  const status = estimateDeltaStatus(hours);
  const reason = estimateDeltaRiskReason(hours);
  return {
    hours,
    status,
    riskTier: status,
    healthy: status === "ok" ? true : status === "risk" ? false : null,
    riskReasons: reason ? [reason] : [],
  };
}
