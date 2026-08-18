function isUtcWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
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
