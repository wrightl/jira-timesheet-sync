const UK_TZ = "Europe/London";
const WORK_START_HOUR = 8;
const WORK_END_HOUR = 17;

type CivilDate = { year: number; month: number; day: number };

type TzParts = CivilDate & {
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function getTzParts(ms: number): TzParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: map.weekday ?? "",
  };
}

/** Convert a Europe/London wall time to a UTC epoch ms (GMT or BST as in force). */
export function ukWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
): number {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const seen = getTzParts(utcGuess);
  const seenAsUtc = Date.UTC(
    seen.year,
    seen.month - 1,
    seen.day,
    seen.hour,
    seen.minute,
    seen.second,
  );
  return utcGuess - (seenAsUtc - utcGuess);
}

function nextCivilDate(date: CivilDate): CivilDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function civilKey(date: CivilDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

function isUkWeekend(date: CivilDate): boolean {
  const noon = ukWallTimeToUtc(date.year, date.month, date.day, 12);
  const weekday = getTzParts(noon).weekday;
  return weekday === "Sat" || weekday === "Sun";
}

/**
 * Elapsed hours between two instants that fall in UK working hours:
 * 08:00–17:00 Monday–Friday in Europe/London (GMT or BST).
 */
export function ukBusinessHoursBetween(start: Date, end: Date): number {
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }

  const startParts = getTzParts(startMs);
  const endParts = getTzParts(endMs);
  let day: CivilDate = {
    year: startParts.year,
    month: startParts.month,
    day: startParts.day,
  };
  const lastKey = civilKey({
    year: endParts.year,
    month: endParts.month,
    day: endParts.day,
  });

  let hours = 0;
  for (let i = 0; i < 400; i++) {
    if (!isUkWeekend(day)) {
      const workStart = ukWallTimeToUtc(
        day.year,
        day.month,
        day.day,
        WORK_START_HOUR,
      );
      const workEnd = ukWallTimeToUtc(
        day.year,
        day.month,
        day.day,
        WORK_END_HOUR,
      );
      const overlapStart = Math.max(startMs, workStart);
      const overlapEnd = Math.min(endMs, workEnd);
      if (overlapEnd > overlapStart) {
        hours += (overlapEnd - overlapStart) / (1000 * 60 * 60);
      }
    }
    if (civilKey(day) === lastKey) break;
    day = nextCivilDate(day);
  }

  return hours;
}
