import { describe, expect, it } from "vitest";
import {
  formatCommentActivity,
  pickLatestActivity,
} from "@/lib/jira-activity";

describe("formatCommentActivity", () => {
  it("includes author and flattened ADF preview", () => {
    expect(
      formatCommentActivity({
        author: { displayName: "Ada Lovelace" },
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Need a status update" }],
            },
          ],
        },
      }),
    ).toBe("Ada Lovelace — Commented: Need a status update");
  });
});

describe("pickLatestActivity", () => {
  it("prefers a newer comment over older history", () => {
    const activity = pickLatestActivity({
      history: {
        created: "2026-08-10T10:00:00.000Z",
        author: { displayName: "Ada" },
        items: [{ field: "status", fromString: "To Do", toString: "In Progress" }],
      },
      comment: {
        created: "2026-08-14T09:00:00.000Z",
        author: { displayName: "Ada" },
        body: "Following up",
      },
      created: "2026-08-01T00:00:00.000Z",
    });
    expect(activity?.at).toBe("2026-08-14T09:00:00.000Z");
    expect(activity?.summary).toBe("Ada — Commented: Following up");
  });

  it("prefers newer history over an older comment", () => {
    const activity = pickLatestActivity({
      history: {
        created: "2026-08-14T12:00:00.000Z",
        items: [{ field: "assignee", toString: "Ada" }],
      },
      comment: {
        created: "2026-08-13T12:00:00.000Z",
        body: "Old note",
      },
    });
    expect(activity?.at).toBe("2026-08-14T12:00:00.000Z");
    expect(activity?.summary).toContain("assignee");
  });
});
