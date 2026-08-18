import { describe, expect, it } from "vitest";
import {
  isTriagedStatus,
  metricsFromTickets,
} from "@/lib/support-ticket-metrics";

describe("isTriagedStatus", () => {
  it("matches Triaged case-insensitively", () => {
    expect(isTriagedStatus("Triaged")).toBe(true);
    expect(isTriagedStatus(" triaged ")).toBe(true);
    expect(isTriagedStatus("In Progress")).toBe(false);
  });
});

describe("metricsFromTickets", () => {
  it("counts only the provided tickets", () => {
    const metrics = metricsFromTickets([
      {
        created: "2026-08-10T09:00:00.000Z",
        updated: "2026-08-10T09:00:00.000Z",
        assignee: "Ada",
      },
    ]);
    expect(metrics.totalCount).toBe(1);
    expect(metrics.ticketsByAssignee).toEqual({ Ada: 1 });
    expect(metrics.averageResponseTimeHours).toBeNull();
  });

  it("averages every completed response cycle", () => {
    const metrics = metricsFromTickets([
      {
        created: "2026-08-10T09:00:00.000Z",
        updated: "2026-08-10T17:00:00.000Z",
        assignee: "Ada",
        responseCycleHours: [4, 2],
      },
      {
        created: "2026-08-11T09:00:00.000Z",
        updated: "2026-08-11T10:00:00.000Z",
        assignee: "Ada",
        responseCycleHours: [6],
      },
    ]);
    expect(metrics.averageResponseTimeHours).toBe(4);
  });
});
