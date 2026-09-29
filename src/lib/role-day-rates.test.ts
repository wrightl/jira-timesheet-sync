import { describe, expect, it } from "vitest";
import {
  ROLE_DAY_RATE_TITLES,
  activeSchedule,
  decodeRoleDayRates,
  encodeRoleDayRates,
  rateForTitleOnDate,
  scheduleTiming,
  type RoleRateSchedule,
} from "@/lib/role-day-rates";

const schedules: RoleRateSchedule[] = [
  {
    effectiveMonth: "2026-01",
    rates: [
      { roleName: "Senior Software Engineer", dayRateCost: 450 },
      { roleName: "Project Manager", dayRateCost: 500 },
    ],
  },
  {
    effectiveMonth: "2026-06",
    rates: [
      { roleName: "Senior Software Engineer", dayRateCost: 600 },
      { roleName: "QA Engineer", dayRateCost: 320 },
    ],
  },
  {
    effectiveMonth: "2027-01",
    rates: [{ roleName: "Senior Software Engineer", dayRateCost: 700 }],
  },
];

describe("role day rate schedules", () => {
  it("keeps the seven fixed job titles", () => {
    expect(ROLE_DAY_RATE_TITLES).toEqual([
      "Senior Software Engineer",
      "Software Engineer",
      "QA Engineer",
      "Project Manager",
      "Senior Graphic Designer",
      "Head of Engineering",
      "Junior Software Engineer",
    ]);
  });

  it("treats the latest started month as active and later months as scheduled", () => {
    expect(activeSchedule(schedules, "2026-09")?.effectiveMonth).toBe("2026-06");
    expect(scheduleTiming("2026-06", schedules, "2026-09")).toBe("active");
    expect(scheduleTiming("2026-01", schedules, "2026-09")).toBe("past");
    expect(scheduleTiming("2027-01", schedules, "2026-09")).toBe("scheduled");
    expect(activeSchedule(schedules, "2025-12")).toBeNull();
  });

  it("uses the set that had started by the timesheet month", () => {
    expect(
      rateForTitleOnDate(
        schedules,
        "senior software engineer",
        "2026-03-15",
      ),
    ).toBe(450);
    expect(
      rateForTitleOnDate(
        schedules,
        "Senior  Software Engineer",
        "2026-06-01",
      ),
    ).toBe(600);
    expect(
      rateForTitleOnDate(schedules, "Project Manager", "2026-03-15"),
    ).toBe(500);
    expect(
      rateForTitleOnDate(schedules, "Project Manager", "2026-06-02"),
    ).toBeNull();
    expect(
      rateForTitleOnDate(schedules, "Senior Software Engineer", "2025-12-31"),
    ).toBeNull();
    expect(
      rateForTitleOnDate(schedules, "Senior Software Engineer", "2027-01-01"),
    ).toBe(700);
    expect(
      rateForTitleOnDate(schedules, "Senior Software Engineer", null),
    ).toBeNull();
  });

  it("round-trips the canonical title map", () => {
    const encoded = encodeRoleDayRates([
      { roleName: "QA Engineer", dayRateCost: 280 },
      { roleName: "Head of Engineering", dayRateCost: 800 },
    ]);
    expect(decodeRoleDayRates(encoded)).toEqual([
      { roleName: "QA Engineer", dayRateCost: 280 },
      { roleName: "Head of Engineering", dayRateCost: 800 },
    ]);
    expect(decodeRoleDayRates("{")).toEqual([]);
  });
});
