/** Job titles that can carry an internal cost day rate. */
export const ROLE_DAY_RATE_TITLES = [
  "Senior Software Engineer",
  "Software Engineer",
  "QA Engineer",
  "Project Manager",
  "Senior Graphic Designer",
  "Head of Engineering",
  "Junior Software Engineer",
] as const;

export type RoleDayRateTitle = (typeof ROLE_DAY_RATE_TITLES)[number];

export type RoleDayRateAmount = {
  roleName: string;
  dayRateCost: number;
};

/** One complete set of title rates, starting on the first day of effectiveMonth. */
export type RoleRateSchedule = {
  effectiveMonth: string;
  rates: RoleDayRateAmount[];
};

export type ScheduleTiming = "active" | "scheduled" | "past";

const EFFECTIVE_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isRoleDayRateTitle(value: string): value is RoleDayRateTitle {
  return (ROLE_DAY_RATE_TITLES as readonly string[]).includes(value);
}

export function isEffectiveMonth(value: string): boolean {
  return EFFECTIVE_MONTH.test(value);
}

export function currentEffectiveMonth(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** YYYY-MM from a timesheet date. Invalid months are rejected. */
export function monthKeyFromDate(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}`;
}

export function formatMonthLabel(effectiveMonth: string): string {
  const match = EFFECTIVE_MONTH.exec(effectiveMonth);
  if (!match) return effectiveMonth;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function titleKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Latest schedule whose month has started by todayMonth. */
export function activeSchedule<T extends { effectiveMonth: string }>(
  schedules: T[],
  todayMonth = currentEffectiveMonth(),
): T | null {
  let chosen: T | null = null;
  for (const schedule of schedules) {
    if (!isEffectiveMonth(schedule.effectiveMonth)) continue;
    if (schedule.effectiveMonth > todayMonth) continue;
    if (!chosen || schedule.effectiveMonth > chosen.effectiveMonth) {
      chosen = schedule;
    }
  }
  return chosen;
}

export function scheduleTiming(
  effectiveMonth: string,
  schedules: { effectiveMonth: string }[],
  todayMonth = currentEffectiveMonth(),
): ScheduleTiming {
  if (effectiveMonth > todayMonth) return "scheduled";
  const active = activeSchedule(schedules, todayMonth);
  if (active?.effectiveMonth === effectiveMonth) return "active";
  return "past";
}

/**
 * Day rate for a job title on a timesheet date.
 * The set in force is the latest one whose month is on or before the
 * timesheet month. A later set replaces the earlier set entirely.
 */
export function rateForTitleOnDate(
  schedules: RoleRateSchedule[],
  jobTitle: string | null | undefined,
  isoDate: string | null | undefined,
): number | null {
  const month = monthKeyFromDate(isoDate);
  const title = jobTitle?.trim();
  if (!month || !title) return null;

  let chosen: RoleRateSchedule | null = null;
  for (const schedule of schedules) {
    if (!isEffectiveMonth(schedule.effectiveMonth)) continue;
    if (schedule.effectiveMonth > month) continue;
    if (!chosen || schedule.effectiveMonth > chosen.effectiveMonth) {
      chosen = schedule;
    }
  }
  if (!chosen) return null;

  const key = titleKey(title);
  for (const rate of chosen.rates) {
    if (titleKey(rate.roleName) !== key) continue;
    if (!Number.isFinite(rate.dayRateCost) || rate.dayRateCost < 0) return null;
    return rate.dayRateCost;
  }
  return null;
}

export function encodeRoleDayRates(rates: RoleDayRateAmount[]): string {
  const record: Record<string, number> = {};
  for (const title of ROLE_DAY_RATE_TITLES) {
    const match = rates.find((rate) => rate.roleName === title);
    if (!match || !Number.isFinite(match.dayRateCost)) continue;
    record[title] = match.dayRateCost;
  }
  return JSON.stringify(record);
}

export function decodeRoleDayRates(
  json: string,
): { roleName: RoleDayRateTitle; dayRateCost: number }[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const record = parsed as Record<string, unknown>;
  const rates: { roleName: RoleDayRateTitle; dayRateCost: number }[] = [];
  for (const title of ROLE_DAY_RATE_TITLES) {
    const value = record[title];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      continue;
    }
    rates.push({ roleName: title, dayRateCost: value });
  }
  return rates;
}
