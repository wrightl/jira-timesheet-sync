import { describe, expect, it } from "vitest";
import type { JiraIssue } from "@/clients/jira-http";
import {
  aggregateJiraIssues,
  composeScopedJql,
  resolveProjectScopeJql,
} from "@/services/jira-metrics";

function issue(
  partial: Partial<JiraIssue> & { key: string; fields?: JiraIssue["fields"] },
): JiraIssue {
  return {
    id: partial.id ?? partial.key,
    key: partial.key,
    fields: {
      summary: "Test",
      issuetype: { name: "Story" },
      status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
      ...partial.fields,
    },
  };
}

describe("jira-metrics helpers", () => {
  it("composes scoped JQL", () => {
    expect(composeScopedJql("project = ABC", "issuetype = Bug")).toBe(
      "(project = ABC) AND (issuetype = Bug)",
    );
  });

  it("resolves scope from budget JQL", () => {
    expect(
      resolveProjectScopeJql({
        jiraBudgetJql: 'project = EPCBC AND status != Done',
      }),
    ).toBe("project = EPCBC AND status != Done");
  });

  it("falls back to project key", () => {
    expect(
      resolveProjectScopeJql({
        jiraBudgetJql: null,
        projectKeyHint: "abc",
      }),
    ).toBe("project = ABC");
  });

  it("aggregates coverage, overages, and open bugs", () => {
    const now = new Date("2026-08-08T12:00:00.000Z");
    const issues = [
      issue({
        key: "A-1",
        fields: {
          timeoriginalestimate: 3600,
          timeestimate: 1800,
          timespent: 1800,
          issuetype: { name: "Story" },
          status: {
            name: "In Progress",
            statusCategory: { key: "indeterminate" },
          },
        },
      }),
      issue({
        key: "A-2",
        fields: {
          timeoriginalestimate: null,
          timeestimate: null,
          timespent: null,
          issuetype: { name: "Task" },
          status: {
            name: "To Do",
            statusCategory: { key: "new" },
          },
        },
      }),
      issue({
        key: "A-3",
        fields: {
          timeoriginalestimate: 3600,
          timespent: 7200,
          issuetype: { name: "Bug" },
          status: {
            name: "Open",
            statusCategory: { key: "new" },
          },
          created: "2026-08-01T00:00:00.000Z",
          priority: { name: "High" },
        },
      }),
      issue({
        key: "A-4",
        fields: {
          issuetype: { name: "Story" },
          status: { name: "Done", statusCategory: { key: "done" } },
          updated: "2026-08-05T00:00:00.000Z",
        },
      }),
    ];

    const agg = aggregateJiraIssues(issues, { now, scopedJql: "project = A" });
    expect(agg.openIssueCount).toBe(3);
    expect(agg.estimatedOpenCount).toBe(2);
    expect(agg.estimateCoveragePct).toBeCloseTo(66.7, 0);
    expect(agg.overageCount).toBe(1);
    expect(agg.overageHours).toBe(1);
    expect(agg.openBugCount).toBe(1);
    expect(agg.openBugs[0]?.key).toBe("A-3");
    expect(agg.storiesCompletedInWindow).toBe(1);
    expect(agg.bugsCreatedInWindow).toBe(1);
    expect(agg.defectInjectionRatio).toBe(1);
  });

  it("counts aging WIP from updated age ≥14d", () => {
    const now = new Date("2026-08-08T12:00:00.000Z");
    const issues = [
      issue({
        key: "OLD-1",
        fields: {
          issuetype: { name: "Story" },
          status: {
            name: "In Progress",
            statusCategory: { key: "indeterminate" },
          },
          updated: "2026-07-01T00:00:00.000Z",
          summary: "Stale work",
        },
      }),
      issue({
        key: "NEW-1",
        fields: {
          issuetype: { name: "Task" },
          status: {
            name: "In Progress",
            statusCategory: { key: "indeterminate" },
          },
          updated: "2026-08-07T00:00:00.000Z",
        },
      }),
      issue({
        key: "DONE-1",
        fields: {
          issuetype: { name: "Story" },
          status: { name: "Done", statusCategory: { key: "done" } },
          updated: "2026-06-01T00:00:00.000Z",
        },
      }),
    ];

    const agg = aggregateJiraIssues(issues, { now });
    expect(agg.agingWipCount).toBe(1);
    expect(agg.agingWipOldest?.key).toBe("OLD-1");
    expect(agg.agingWipOldest?.ageDays).toBeGreaterThanOrEqual(14);
  });
});
