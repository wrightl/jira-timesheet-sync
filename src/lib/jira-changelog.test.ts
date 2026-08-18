import { describe, expect, it } from "vitest";
import {
  formatChangelogActivity,
  isChangelogTruncated,
  latestChangelogHistory,
} from "@/lib/jira-changelog";

describe("jira changelog helpers", () => {
  it("picks the newest history entry by created time", () => {
    const latest = latestChangelogHistory({
      histories: [
        { created: "2026-08-10T10:00:00.000Z", items: [{ field: "status" }] },
        { created: "2026-08-14T09:00:00.000Z", items: [{ field: "assignee" }] },
        { created: "2026-08-12T12:00:00.000Z", items: [{ field: "priority" }] },
      ],
    });
    expect(latest?.items?.[0]?.field).toBe("assignee");
  });

  it("reads values from the changelog endpoint shape", () => {
    const latest = latestChangelogHistory({
      values: [
        { created: "2026-08-01T00:00:00.000Z" },
        { created: "2026-08-02T00:00:00.000Z" },
      ],
    });
    expect(latest?.created).toBe("2026-08-02T00:00:00.000Z");
  });

  it("detects truncated changelogs", () => {
    expect(
      isChangelogTruncated({
        total: 5,
        histories: [{ created: "2026-08-01T00:00:00.000Z" }],
      }),
    ).toBe(true);
    expect(
      isChangelogTruncated({
        total: 1,
        histories: [{ created: "2026-08-01T00:00:00.000Z" }],
      }),
    ).toBe(false);
  });

  it("formats field transitions with author", () => {
    expect(
      formatChangelogActivity({
        author: { displayName: "Ada Lovelace" },
        items: [
          {
            field: "status",
            fromString: "To Do",
            toString: "In Progress",
          },
        ],
      }),
    ).toBe("Ada Lovelace — status: To Do → In Progress");
  });
});
