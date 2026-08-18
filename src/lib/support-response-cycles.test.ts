import { describe, expect, it } from "vitest";
import { responseCycleHours } from "@/lib/support-response-cycles";
import type { JiraChangelogHistory } from "@/lib/jira-changelog";
import { ukWallTimeToUtc } from "@/lib/uk-business-hours";

function statusChange(
  at: string,
  fromStatus: string,
  toStatus: string,
): JiraChangelogHistory {
  return {
    created: at,
    items: [{ field: "status", fromString: fromStatus, toString: toStatus }],
  };
}

function ukIso(year: number, month: number, day: number, hour: number): string {
  return new Date(ukWallTimeToUtc(year, month, day, hour)).toISOString();
}

describe("responseCycleHours", () => {
  it("measures created to first Waiting for customer in UK working hours", () => {
    const hours = responseCycleHours({
      created: ukIso(2026, 8, 10, 9),
      histories: [
        statusChange(ukIso(2026, 8, 10, 11), "To Do", "In Progress"),
        statusChange(
          ukIso(2026, 8, 10, 17),
          "In Progress",
          "Waiting for customer",
        ),
      ],
    });
    expect(hours).toEqual([8]);
  });

  it("counts each return to Waiting for customer as a separate cycle", () => {
    const hours = responseCycleHours({
      created: ukIso(2026, 8, 10, 9),
      histories: [
        statusChange(ukIso(2026, 8, 10, 13), "To Do", "Waiting for customer"),
        statusChange(
          ukIso(2026, 8, 11, 9),
          "Waiting for customer",
          "In Progress",
        ),
        statusChange(
          ukIso(2026, 8, 11, 12),
          "In Progress",
          "Waiting for customer",
        ),
      ],
    });
    expect(hours).toEqual([4, 3]);
  });

  it("counts a move to Done as a response cycle", () => {
    const hours = responseCycleHours({
      created: ukIso(2026, 8, 10, 9),
      histories: [
        statusChange(ukIso(2026, 8, 10, 15), "In Progress", "Done"),
      ],
    });
    expect(hours).toEqual([6]);
  });

  it("does not count Waiting for customer → Done as another cycle", () => {
    const hours = responseCycleHours({
      created: ukIso(2026, 8, 10, 9),
      histories: [
        statusChange(ukIso(2026, 8, 10, 13), "To Do", "Waiting for customer"),
        statusChange(ukIso(2026, 8, 10, 16), "Waiting for customer", "Done"),
      ],
    });
    expect(hours).toEqual([4]);
  });

  it("returns no cycles when the ticket never reached waiting or done", () => {
    const hours = responseCycleHours({
      created: ukIso(2026, 8, 10, 9),
      histories: [
        statusChange(ukIso(2026, 8, 10, 11), "To Do", "In Progress"),
      ],
    });
    expect(hours).toEqual([]);
  });

  it("does not count overnight or weekend hours outside 8am-5pm", () => {
    const hours = responseCycleHours({
      created: ukIso(2026, 8, 14, 16), // Friday 4pm
      histories: [
        statusChange(
          ukIso(2026, 8, 17, 10), // Monday 10am
          "In Progress",
          "Waiting for customer",
        ),
      ],
    });
    expect(hours).toEqual([3]);
  });
});
