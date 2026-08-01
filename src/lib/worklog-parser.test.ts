import { describe, expect, it } from "vitest";
import { parseWorklogWebhookPayload } from "@/lib/worklog-parser";

const samplePayload = {
  webhookEvent: "worklog_created",
  worklog: {
    id: "10001",
    issueId: "10050",
    timeSpentSeconds: 3600,
    started: "2026-08-01T09:00:00.000+0000",
    author: {
      accountId: "acc-1",
      displayName: "Ada Lovelace",
    },
    comment: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Pairing session" }],
        },
      ],
    },
  },
  issue: {
    id: "10050",
    key: "ENG-42",
    fields: {
      project: {
        id: "10000",
        key: "ENG",
      },
    },
  },
};

describe("parseWorklogWebhookPayload", () => {
  it("extracts worklog, issue, and space fields", () => {
    const parsed = parseWorklogWebhookPayload(samplePayload);
    expect(parsed).toEqual({
      eventType: "worklog_created",
      worklogId: "10001",
      issueId: "10050",
      issueKey: "ENG-42",
      spaceId: "10000",
      spaceKey: "ENG",
      authorAccountId: "acc-1",
      authorDisplayName: "Ada Lovelace",
      timeSpentSeconds: 3600,
      started: "2026-08-01T09:00:00.000+0000",
      comment: "Pairing session",
    });
  });

  it("returns null for unsupported events", () => {
    expect(
      parseWorklogWebhookPayload({
        ...samplePayload,
        webhookEvent: "jira:issue_updated",
      }),
    ).toBeNull();
  });

  it("returns null when worklog id is missing", () => {
    expect(
      parseWorklogWebhookPayload({
        webhookEvent: "worklog_updated",
        worklog: { timeSpentSeconds: 10 },
      }),
    ).toBeNull();
  });

  it("handles numeric worklog ids", () => {
    const parsed = parseWorklogWebhookPayload({
      webhookEvent: "worklog_deleted",
      worklog: { id: 55 },
      issue: { key: "OPS-1", fields: { project: { id: 9, key: "OPS" } } },
    });
    expect(parsed?.worklogId).toBe("55");
    expect(parsed?.spaceId).toBe("9");
    expect(parsed?.spaceKey).toBe("OPS");
  });
});
