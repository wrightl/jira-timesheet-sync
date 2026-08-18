/**
 * Forecast / staffing helpers for portfolio and project dashboards.
 * Eng-week = 30 billable hours (37.5h week × 80% utilisation).
 * Gap is remaining work beyond 1 FTE calendar capacity until the project
 * end (or forecast) date.
 */

export type ForecastConfidence = "high" | "medium" | "low" | "unavailable";

export type StaffingForecast = {
  remainingHours: number | null;
  remainingEngWeeks: number | null;
  daysToTarget: number | null;
  targetDate: string | null;
  staffingGapEngWeeks: number | null;
  staffingAsk: string | null;
  forecastConfidence: ForecastConfidence;
};

/** 37.5 contracted hours × 80% utilisation. */
export const HOURS_PER_ENG_WEEK = 30;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function toDateKey(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (match) return match[1] ?? null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function calendarDaysUntil(
  targetIso: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const key = toDateKey(targetIso);
  if (!key) return null;
  const todayKey = now.toISOString().slice(0, 10);
  const target = Date.parse(`${key}T00:00:00.000Z`);
  const today = Date.parse(`${todayKey}T00:00:00.000Z`);
  if (!Number.isFinite(target) || !Number.isFinite(today)) return null;
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
}

export function computeStaffingForecast(input: {
  remainingHours?: number | null;
  endDate?: string | null;
  forecastEndDate?: string | null;
  hasJiraRemainingEffort?: boolean;
  estimateCoveragePct?: number | null;
  now?: Date;
}): StaffingForecast {
  const remainingHours =
    input.remainingHours != null && Number.isFinite(input.remainingHours)
      ? Math.max(0, input.remainingHours)
      : null;
  const remainingEngWeeks =
    remainingHours != null ? round1(remainingHours / HOURS_PER_ENG_WEEK) : null;

  const endKey = toDateKey(input.endDate);
  const forecastKey = toDateKey(input.forecastEndDate);
  // Prefer contractual end date for the staffing ask; fall back to forecast.
  const targetDate = endKey ?? forecastKey;
  const daysToTarget = calendarDaysUntil(targetDate, input.now ?? new Date());

  let staffingGapEngWeeks: number | null = null;
  if (remainingEngWeeks != null && daysToTarget != null && daysToTarget > 0) {
    const capacityEngWeeksOneFte = daysToTarget / 7;
    staffingGapEngWeeks = round1(
      Math.max(0, remainingEngWeeks - capacityEngWeeksOneFte),
    );
  } else if (
    remainingEngWeeks != null &&
    daysToTarget != null &&
    daysToTarget <= 0 &&
    remainingEngWeeks > 0
  ) {
    staffingGapEngWeeks = remainingEngWeeks;
  }

  let staffingAsk: string | null = null;
  if (staffingGapEngWeeks != null && targetDate) {
    if (staffingGapEngWeeks <= 0) {
      staffingAsk = `On track for ${targetDate} at 1 FTE`;
    } else {
      staffingAsk = `Need +${staffingGapEngWeeks} eng-weeks by ${targetDate}`;
    }
  } else if (remainingEngWeeks != null) {
    staffingAsk = `${remainingEngWeeks} eng-weeks remaining (no end date)`;
  }

  let forecastConfidence: ForecastConfidence = "unavailable";
  if (remainingHours != null) {
    if (
      input.hasJiraRemainingEffort &&
      input.estimateCoveragePct != null &&
      input.estimateCoveragePct >= 90
    ) {
      forecastConfidence = "high";
    } else if (
      input.hasJiraRemainingEffort ||
      (input.estimateCoveragePct != null && input.estimateCoveragePct >= 70)
    ) {
      forecastConfidence = "medium";
    } else {
      forecastConfidence = "low";
    }
  }

  return {
    remainingHours,
    remainingEngWeeks,
    daysToTarget,
    targetDate,
    staffingGapEngWeeks,
    staffingAsk,
    forecastConfidence,
  };
}

export function staffingGapStatus(
  gapEngWeeks: number | null,
): "ok" | "watch" | "risk" | "unavailable" {
  if (gapEngWeeks == null) return "unavailable";
  if (gapEngWeeks >= 2) return "risk";
  if (gapEngWeeks >= 0.5) return "watch";
  return "ok";
}
