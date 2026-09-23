import { describe, expect, it } from "vitest";
import {
  HOURS_PER_WORKING_DAY,
  HOURS_PER_WORKING_WEEK,
  formatWorkingDuration,
} from "@/lib/working-duration";

describe("formatWorkingDuration", () => {
  it("uses 7.5h days and 5-day weeks", () => {
    expect(HOURS_PER_WORKING_DAY).toBe(7.5);
    expect(HOURS_PER_WORKING_WEEK).toBe(37.5);
    expect(formatWorkingDuration(47.5)).toBe("1w 1d 2.5h");
  });

  it("omits zero week/day/hour parts", () => {
    expect(formatWorkingDuration(0)).toBe("0h");
    expect(formatWorkingDuration(2.5)).toBe("2.5h");
    expect(formatWorkingDuration(7.5)).toBe("1d");
    expect(formatWorkingDuration(8)).toBe("1d 0.5h");
    expect(formatWorkingDuration(37.5)).toBe("1w");
    expect(formatWorkingDuration(45)).toBe("1w 1d");
  });

  it("shows leftover minutes when the remainder is not a half hour", () => {
    expect(formatWorkingDuration(0.25)).toBe("15m");
    expect(formatWorkingDuration(2.25)).toBe("2h 15m");
    expect(formatWorkingDuration(47.25)).toBe("1w 1d 2h 15m");
  });

  it("prefixes negative values and optional positive signs", () => {
    expect(formatWorkingDuration(-47.5)).toBe("-1w 1d 2.5h");
    expect(formatWorkingDuration(47.5, { signed: true })).toBe("+1w 1d 2.5h");
    expect(formatWorkingDuration(-8, { signed: true })).toBe("-1d 0.5h");
    expect(formatWorkingDuration(0, { signed: true })).toBe("0h");
  });

  it("returns an em dash for missing values", () => {
    expect(formatWorkingDuration(null)).toBe("—");
    expect(formatWorkingDuration(undefined)).toBe("—");
    expect(formatWorkingDuration(Number.NaN)).toBe("—");
  });

  it("treats sub-minute remainders as zero hours", () => {
    expect(formatWorkingDuration(0.001)).toBe("0h");
    expect(formatWorkingDuration(-0.001)).toBe("0h");
  });
});
