import { describe, expect, it } from "vitest";
import { weekdayHoursBetween } from "@/lib/weekday-hours";

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
  });

  it("returns 0 when end is not after start", () => {
    const t = new Date("2026-08-12T09:00:00.000Z");
    expect(weekdayHoursBetween(t, t)).toBe(0);
    expect(weekdayHoursBetween(t, new Date("2026-08-12T08:00:00.000Z"))).toBe(0);
  });
});
