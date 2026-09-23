import { describe, expect, it } from "vitest";
import {
  countUtcWeekdaysBetween,
  isUtcWeekendIsoDate,
  utcAddWeekdays,
  utcCalendarDateRange,
  utcWeekdayDateRange,
  utcWeekdayDiffDays,
  weekdayDaysBetween,
  weekdayHoursBetween,
  workingHoursForWeekdays,
} from "@/lib/weekday-hours";

describe("weekend date helpers", () => {
  it("detects Saturday and Sunday ISO dates", () => {
    expect(isUtcWeekendIsoDate("2026-08-22")).toBe(true); // Saturday
    expect(isUtcWeekendIsoDate("2026-08-23")).toBe(true); // Sunday
    expect(isUtcWeekendIsoDate("2026-08-21")).toBe(false); // Friday
    expect(isUtcWeekendIsoDate("2026-08-24")).toBe(false); // Monday
    expect(isUtcWeekendIsoDate(null)).toBe(false);
  });

  it("drops weekends from a calendar date range", () => {
    expect(utcCalendarDateRange(new Date("2026-08-25T15:00:00.000Z"), 3)).toEqual([
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
    ]);
    expect(utcWeekdayDateRange(new Date("2026-08-25T15:00:00.000Z"), 3)).toEqual([
      "2026-08-24",
      "2026-08-25",
    ]);
    expect(utcWeekdayDateRange(new Date("2026-08-25T15:00:00.000Z"), 7)).toEqual([
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-24",
      "2026-08-25",
    ]);
  });

  it("counts weekdays between two dates", () => {
    expect(countUtcWeekdaysBetween("2026-08-13", "2026-08-20", { exclusiveStart: true })).toBe(5);
    expect(countUtcWeekdaysBetween("2026-08-21", "2026-08-24", { exclusiveStart: true })).toBe(1);
  });

  it("pro-rates contracted hours over weekdays, not calendar days", () => {
    expect(workingHoursForWeekdays(37.5, 5)).toBe(37.5);
    expect(workingHoursForWeekdays(37.5, 1)).toBe(7.5);
    expect(workingHoursForWeekdays(37.5, 0)).toBe(0);
  });

  it("shifts by weekdays, skipping Saturday and Sunday", () => {
    expect(utcAddWeekdays(new Date("2026-08-25T15:00:00.000Z"), -1).toISOString().slice(0, 10)).toBe(
      "2026-08-24",
    );
    expect(utcAddWeekdays(new Date("2026-08-24T15:00:00.000Z"), -1).toISOString().slice(0, 10)).toBe(
      "2026-08-21",
    );
    expect(utcAddWeekdays(new Date("2026-08-25T12:00:00.000Z"), -7).toISOString().slice(0, 10)).toBe(
      "2026-08-14",
    );
  });

  it("returns signed weekday diffs exclusive of the start date", () => {
    expect(utcWeekdayDiffDays("2026-08-20", "2026-08-13")).toBe(5);
    expect(utcWeekdayDiffDays("2026-08-13", "2026-08-20")).toBe(-5);
    expect(utcWeekdayDiffDays("2026-08-24", "2026-08-21")).toBe(1);
    expect(utcWeekdayDiffDays("2026-08-21", "2026-08-21")).toBe(0);
    expect(utcWeekdayDiffDays(null, "2026-08-21")).toBeNull();
  });
});

describe("weekdayHoursBetween", () => {
  it("counts hours on the same weekday", () => {
    const start = new Date("2026-08-12T09:00:00.000Z"); // Wednesday
    const end = new Date("2026-08-12T17:00:00.000Z");
    expect(weekdayHoursBetween(start, end)).toBe(8);
  });

  it("excludes Saturday and Sunday between Friday and Monday", () => {
    const start = new Date("2026-08-14T17:00:00.000Z"); // Friday
    const end = new Date("2026-08-17T09:00:00.000Z"); // Monday
    // Friday 17:00–24:00 = 7h, Monday 00:00–09:00 = 9h
    expect(weekdayHoursBetween(start, end)).toBe(16);
  });

  it("returns 0 when the interval is entirely on a weekend", () => {
    const start = new Date("2026-08-15T10:00:00.000Z"); // Saturday
    const end = new Date("2026-08-16T18:00:00.000Z"); // Sunday
    expect(weekdayHoursBetween(start, end)).toBe(0);
    expect(weekdayDaysBetween(start, end)).toBe(0);
  });

  it("returns 0 when end is not after start", () => {
    const t = new Date("2026-08-12T09:00:00.000Z");
    expect(weekdayHoursBetween(t, t)).toBe(0);
    expect(weekdayHoursBetween(t, new Date("2026-08-12T08:00:00.000Z"))).toBe(0);
  });
});
