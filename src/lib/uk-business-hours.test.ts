import { describe, expect, it } from "vitest";
import {
  ukBusinessHoursBetween,
  ukWallTimeToUtc,
} from "@/lib/uk-business-hours";

describe("ukWallTimeToUtc", () => {
  it("maps BST wall time to UTC+1 in summer", () => {
    expect(ukWallTimeToUtc(2026, 8, 10, 8)).toBe(
      Date.parse("2026-08-10T07:00:00.000Z"),
    );
  });

  it("maps GMT wall time to UTC in winter", () => {
    expect(ukWallTimeToUtc(2026, 1, 12, 8)).toBe(
      Date.parse("2026-01-12T08:00:00.000Z"),
    );
  });
});

describe("ukBusinessHoursBetween", () => {
  it("counts a full UK working day as 9 hours", () => {
    const start = new Date(ukWallTimeToUtc(2026, 8, 10, 8));
    const end = new Date(ukWallTimeToUtc(2026, 8, 10, 17));
    expect(ukBusinessHoursBetween(start, end)).toBe(9);
  });

  it("clips time before 8am and after 5pm", () => {
    const start = new Date(ukWallTimeToUtc(2026, 8, 10, 7));
    const end = new Date(ukWallTimeToUtc(2026, 8, 10, 18));
    expect(ukBusinessHoursBetween(start, end)).toBe(9);
  });

  it("counts only the working-hour overlap on the same day", () => {
    const start = new Date(ukWallTimeToUtc(2026, 8, 10, 16));
    const end = new Date(ukWallTimeToUtc(2026, 8, 10, 18));
    expect(ukBusinessHoursBetween(start, end)).toBe(1);
  });

  it("skips weekends between Friday and Monday", () => {
    const start = new Date(ukWallTimeToUtc(2026, 8, 14, 16)); // Friday
    const end = new Date(ukWallTimeToUtc(2026, 8, 17, 10)); // Monday
    expect(ukBusinessHoursBetween(start, end)).toBe(3);
  });

  it("returns 0 for an interval entirely outside working hours", () => {
    const start = new Date(ukWallTimeToUtc(2026, 8, 10, 18));
    const end = new Date(ukWallTimeToUtc(2026, 8, 10, 20));
    expect(ukBusinessHoursBetween(start, end)).toBe(0);
  });

  it("uses GMT in January", () => {
    const start = new Date("2026-01-12T09:00:00.000Z");
    const end = new Date("2026-01-12T12:00:00.000Z");
    expect(ukBusinessHoursBetween(start, end)).toBe(3);
  });
});
