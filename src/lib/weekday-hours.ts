const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAYS_PER_WEEK = 5;

export function isoDateKey(
  value: string | Date | null | undefined,
): string | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  if (!value?.trim()) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (match?.[1]) return match[1];
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

export function isUtcWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** Saturday or Sunday in UTC, from an ISO date (`YYYY-MM-DD`) or Date. */
export function isUtcWeekendIsoDate(
  value: string | Date | null | undefined,
): boolean {
  const key = isoDateKey(value);
  if (!key) return false;
  const ms = Date.parse(`${key}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return false;
  return isUtcWeekend(new Date(ms));
}

export function utcCalendarDateRange(
  endDate: Date,
  rangeDays: number,
): string[] {
  const days = Math.min(Math.max(rangeDays, 1), 90);
  const endKey = isoDateKey(endDate);
  if (!endKey) return [];
  const endMs = Date.parse(`${endKey}T00:00:00.000Z`);
  const startMs = endMs - (days - 1) * MS_PER_DAY;
  const dates: string[] = [];
  for (let i = 0; i < days; i += 1) {
    dates.push(new Date(startMs + i * MS_PER_DAY).toISOString().slice(0, 10));
  }
  return dates;
}

/** Last `rangeDays` calendar days ending on `endDate`, excluding Sat/Sun. */
export function utcWeekdayDateRange(endDate: Date, rangeDays: number): string[] {
  return utcCalendarDateRange(endDate, rangeDays).filter(
    (date) => !isUtcWeekendIsoDate(date),
  );
}

/**
 * Shift `from` by `delta` weekdays (UTC). Saturday and Sunday are skipped.
 * `delta` of 0 returns the UTC calendar day of `from`.
 */
export function utcAddWeekdays(from: Date, delta: number): Date {
  const startKey = isoDateKey(from);
  if (!startKey) return new Date(Number.NaN);
  let ms = Date.parse(`${startKey}T00:00:00.000Z`);
  if (delta === 0) return new Date(ms);
  const step = delta > 0 ? 1 : -1;
  let remaining = Math.abs(delta);
  while (remaining > 0) {
    ms += step * MS_PER_DAY;
    if (!isUtcWeekend(new Date(ms))) remaining -= 1;
  }
  return new Date(ms);
}

/** Signed weekday count from `from` to `to` (exclusive of `from`). */
export function utcWeekdayDiffDays(
  to: string | Date | null | undefined,
  from: string | Date | null | undefined,
): number | null {
  const toKey = isoDateKey(to);
  const fromKey = isoDateKey(from);
  if (!toKey || !fromKey) return null;
  if (toKey === fromKey) return 0;
  if (toKey > fromKey) {
    return countUtcWeekdaysBetween(fromKey, toKey, { exclusiveStart: true });
  }
  return -countUtcWeekdaysBetween(toKey, fromKey, { exclusiveStart: true });
}

export function countUtcWeekdaysBetween(
  startKey: string,
  endKey: string,
  options?: { exclusiveStart?: boolean },
): number {
  const startMs = Date.parse(`${startKey}T00:00:00.000Z`);
  const endMs = Date.parse(`${endKey}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return 0;
  }
  let count = 0;
  const first = options?.exclusiveStart ? startMs + MS_PER_DAY : startMs;
  for (let ms = first; ms <= endMs; ms += MS_PER_DAY) {
    if (!isUtcWeekend(new Date(ms))) count += 1;
  }
  return count;
}

/** Contracted hours for a span of weekdays (full-time week = 5 weekdays). */
export function workingHoursForWeekdays(
  weeklyHours: number,
  weekdayCount: number,
): number {
  if (!(weeklyHours > 0) || weekdayCount <= 0) return 0;
  return weeklyHours * (weekdayCount / WEEKDAYS_PER_WEEK);
}

/** Elapsed hours between two instants, excluding Saturday and Sunday (UTC). */
export function weekdayHoursBetween(start: Date, end: Date): number {
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }

  let hours = 0;
  let cursor = startMs;

  while (cursor < endMs) {
    const nextUtcMidnight = Date.UTC(
      new Date(cursor).getUTCFullYear(),
      new Date(cursor).getUTCMonth(),
      new Date(cursor).getUTCDate() + 1,
    );
    const sliceEnd = Math.min(endMs, nextUtcMidnight);
    if (!isUtcWeekend(new Date(cursor))) {
      hours += (sliceEnd - cursor) / (1000 * 60 * 60);
    }
    cursor = sliceEnd;
  }

  return hours;
}

export function weekdayDaysBetween(start: Date, end: Date): number {
  return weekdayHoursBetween(start, end) / 24;
}
