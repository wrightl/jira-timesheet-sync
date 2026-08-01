import { describe, expect, it } from "vitest";
import {
  budgetCategoryFromJobTitle,
  buildTimesheetBody,
  formatBitmapDateRangeBound,
  formatTimesheetDate,
  hoursFromSeconds,
  projectDateRangeFromStarted,
  selectActiveStartedProject,
  selectProjectBudget,
} from "@/services/bitmap-resolver";

describe("hoursFromSeconds", () => {
  it("converts seconds to hours", () => {
    expect(hoursFromSeconds(3600)).toBe(1);
    expect(hoursFromSeconds(1800)).toBe(0.5);
  });
});

describe("formatTimesheetDate", () => {
  it("formats started as yyyy-MM-dd in UTC", () => {
    expect(formatTimesheetDate("2026-08-01T10:00:00.000+0000")).toBe(
      "2026-08-01",
    );
  });
});

describe("projectDateRangeFromStarted", () => {
  it("uses first of month through same day next year", () => {
    const range = projectDateRangeFromStarted("2026-02-15T12:00:00.000Z");
    expect(range.rangeStart).toBe("Sun Feb 01 2026 00:00:00 GMT+0000");
    expect(range.rangeEnd).toBe("Mon Feb 15 2027 23:59:59 GMT+0000");
  });
});

describe("formatBitmapDateRangeBound", () => {
  it("formats UTC dates in Bitmap query style", () => {
    const date = new Date(Date.UTC(2026, 1, 1, 0, 0, 0));
    expect(formatBitmapDateRangeBound(date)).toBe(
      "Sun Feb 01 2026 00:00:00 GMT+0000",
    );
  });
});

describe("budgetCategoryFromJobTitle", () => {
  it("maps QA titles to QA and others to Development", () => {
    expect(budgetCategoryFromJobTitle("QA Engineer")).toBe("QA");
    expect(budgetCategoryFromJobTitle("Senior qa analyst")).toBe("QA");
    expect(budgetCategoryFromJobTitle("Software Engineer")).toBe("Development");
    expect(budgetCategoryFromJobTitle(null)).toBe("Development");
  });
});

describe("selectActiveStartedProject", () => {
  it("returns the first active started project", () => {
    const project = selectActiveStartedProject([
      { id: "1", state: "active", started: false },
      { id: "2", state: "active", started: true },
      { id: "3", state: "active", started: true },
    ]);
    expect(project?.id).toBe("2");
  });

  it("returns null when none match", () => {
    expect(
      selectActiveStartedProject([
        { id: "1", state: "active", started: false },
      ]),
    ).toBeNull();
  });
});

describe("selectProjectBudget", () => {
  const budgets = [
    { id: "dev", name: "Development", billable_time_remaining: 0 },
    { id: "qa", name: "QA", billable_time_remaining: 10 },
    { id: "other", name: "Other", billable_time_remaining: 5 },
  ];

  it("prefers QA budget for QA job titles", () => {
    expect(selectProjectBudget(budgets, "QA Engineer")?.id).toBe("qa");
  });

  it("prefers Development budget for engineers", () => {
    expect(selectProjectBudget(budgets, "Software Engineer")?.id).toBe("dev");
  });

  it("falls back to first budget with remaining billable time", () => {
    expect(
      selectProjectBudget(
        [
          { id: "empty", name: "Misc", billable_time_remaining: 0 },
          { id: "ok", name: "Misc 2", billable_time_remaining: 3 },
        ],
        "Software Engineer",
      )?.id,
    ).toBe("ok");
  });
});

describe("buildTimesheetBody", () => {
  it("builds the Bitmap timesheet payload", () => {
    expect(
      buildTimesheetBody({
        userId: "u1",
        projectId: "p1",
        projectBudgetId: "b1",
        started: "2026-08-01T10:00:00.000+0000",
        timeSpentSeconds: 1800,
        comment: "Fixed bug",
      }),
    ).toEqual({
      timesheet_entry: {
        user_id: "u1",
        project_id: "p1",
        project_budget_id: "b1",
        date: "2026-08-01",
        hours: 0.5,
        notes: "Fixed bug",
        billable: "true",
        nonbillable_reason: "",
      },
    });
  });
});
