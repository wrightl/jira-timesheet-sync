/** Working-day duration for project estimate / budget hours. */
export const HOURS_PER_WORKING_DAY = 7.5;
export const DAYS_PER_WORKING_WEEK = 5;
export const HOURS_PER_WORKING_WEEK =
  HOURS_PER_WORKING_DAY * DAYS_PER_WORKING_WEEK;

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_WORKING_DAY = HOURS_PER_WORKING_DAY * MINUTES_PER_HOUR;
const MINUTES_PER_WORKING_WEEK = HOURS_PER_WORKING_WEEK * MINUTES_PER_HOUR;

export type FormatWorkingDurationOptions = {
  /** Prefix positive values with `+` (for slip / delta metrics). */
  signed?: boolean;
};

/**
 * Format hour totals using Jira-style working time:
 * 7.5 hours per day, 5 days per week.
 * Example: 47.5 → `1w 1d 2.5h`.
 */
export function formatWorkingDuration(
  hours: number | null | undefined,
  options: FormatWorkingDurationOptions = {},
): string {
  if (hours == null || !Number.isFinite(hours)) return "—";

  const sign = hours < 0 ? "-" : options.signed && hours > 0 ? "+" : "";
  let remainingMinutes = Math.round(Math.abs(hours) * MINUTES_PER_HOUR);

  const weeks = Math.floor(remainingMinutes / MINUTES_PER_WORKING_WEEK);
  remainingMinutes %= MINUTES_PER_WORKING_WEEK;
  const days = Math.floor(remainingMinutes / MINUTES_PER_WORKING_DAY);
  remainingMinutes %= MINUTES_PER_WORKING_DAY;
  const wholeHours = Math.floor(remainingMinutes / MINUTES_PER_HOUR);
  const minutes = remainingMinutes % MINUTES_PER_HOUR;

  const parts: string[] = [];
  if (weeks > 0) parts.push(`${weeks}w`);
  if (days > 0) parts.push(`${days}d`);
  if (wholeHours > 0 || minutes > 0) {
    parts.push(formatHourMinutePart(wholeHours, minutes));
  }

  if (parts.length === 0) return `${sign}0h`;
  return `${sign}${parts.join(" ")}`;
}

function formatHourMinutePart(hours: number, minutes: number): string {
  if (minutes === 0) return `${hours}h`;
  if (minutes === 30) {
    return hours > 0 ? `${hours}.5h` : "0.5h";
  }
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
