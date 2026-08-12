import { describe, expect, it } from "vitest";
import { computeFlowMetrics } from "@/services/github-dashboard";
import type { GithubPullSummary } from "@/clients/github-http";

describe("computeFlowMetrics", () => {
  it("computes stale count, review lag, and author WIP", () => {
    const now = new Date("2026-08-12T12:00:00.000Z");
    const pulls: GithubPullSummary[] = [
      {
        id: "a#1",
        number: 1,
        title: "One",
        url: "https://example.com/1",
        repository: "acme/app",
        state: "published",
        needsReview: true,
        createdAt: "2026-08-10T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
        openCommentCount: 0,
        authorLogin: "lee",
        firstReviewedAt: "2026-08-10T18:00:00.000Z",
      },
      {
        id: "a#2",
        number: 2,
        title: "Two",
        url: "https://example.com/2",
        repository: "acme/app",
        state: "published",
        needsReview: false,
        createdAt: "2026-08-11T12:00:00.000Z",
        updatedAt: "2026-08-12T00:00:00.000Z",
        openCommentCount: 1,
        authorLogin: "lee",
        firstReviewedAt: null,
      },
      {
        id: "a#3",
        number: 3,
        title: "Three",
        url: "https://example.com/3",
        repository: "acme/app",
        state: "draft",
        needsReview: false,
        createdAt: "2026-08-12T00:00:00.000Z",
        updatedAt: "2026-08-12T01:00:00.000Z",
        openCommentCount: 0,
        authorLogin: "sam",
        firstReviewedAt: null,
      },
    ];

    const flow = computeFlowMetrics(pulls, { now, staleDays: 7 });
    expect(flow.staleCount).toBe(1);
    expect(flow.medianTimeToFirstReviewHours).toBe(6);
    expect(flow.authorWip[0]).toEqual({ login: "lee", openCount: 2 });
    expect(flow.medianOpenAgeHours).not.toBeNull();
  });
});
