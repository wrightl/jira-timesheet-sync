import { describe, expect, it, vi } from "vitest";
import { GithubHttpClient } from "@/clients/github-http";
import {
  GithubDashboardService,
  formatPullAge,
} from "@/services/github-dashboard";
import type { GithubSettingsService } from "@/services/github-settings-service";
import type { GithubApiClient } from "@/clients/github-http";

describe("formatPullAge", () => {
  it("formats ages in minutes hours and days", () => {
    const now = new Date("2026-08-12T12:00:00.000Z");
    expect(formatPullAge("2026-08-12T11:30:00.000Z", now)).toBe("30m");
    expect(formatPullAge("2026-08-12T08:00:00.000Z", now)).toBe("4h");
    expect(formatPullAge("2026-08-09T12:00:00.000Z", now)).toBe("3d");
  });
});

describe("GithubHttpClient.searchOpenPullRequests", () => {
  it("parses GraphQL pull request nodes", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: {
            search: {
              issueCount: 2,
              nodes: [
                {
                  number: 12,
                  title: "Add dashboard",
                  url: "https://github.com/acme/app/pull/12",
                  isDraft: false,
                  createdAt: "2026-08-01T00:00:00Z",
                  updatedAt: "2026-08-11T00:00:00Z",
                  reviewDecision: "REVIEW_REQUIRED",
                  comments: { totalCount: 3 },
                  reviewThreads: {
                    nodes: [{ isResolved: false }, { isResolved: true }],
                  },
                  repository: { nameWithOwner: "acme/app" },
                },
                {
                  number: 9,
                  title: "WIP",
                  url: "https://github.com/acme/app/pull/9",
                  isDraft: true,
                  createdAt: "2026-08-02T00:00:00Z",
                  updatedAt: "2026-08-10T00:00:00Z",
                  reviewDecision: null,
                  comments: { totalCount: 0 },
                  reviewThreads: { nodes: [] },
                  repository: { nameWithOwner: "acme/app" },
                },
              ],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = new GithubHttpClient({
      token: "ghp_test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.searchOpenPullRequests("acme", { first: 20 });
    expect(result.totalCount).toBe(2);
    expect(result.pulls[0]).toMatchObject({
      number: 12,
      state: "published",
      needsReview: true,
      openCommentCount: 4,
      repository: "acme/app",
    });
    expect(result.pulls[1]).toMatchObject({
      state: "draft",
      needsReview: false,
      openCommentCount: 0,
    });
  });
});

describe("GithubDashboardService", () => {
  it("returns unconfigured when credentials missing", async () => {
    const settings = {
      createConfiguredClient: async () => null,
    } as Pick<GithubSettingsService, "createConfiguredClient">;
    const service = new GithubDashboardService(
      settings as GithubSettingsService,
    );
    await expect(service.getDashboard("u1")).resolves.toMatchObject({
      configured: false,
      recentPullRequests: [],
    });
  });

  it("aggregates metrics from the GitHub client", async () => {
    const client: GithubApiClient = {
      getViewerLogin: async () => "lee",
      countOpenPullRequests: async (_org, qualifier = "") => {
        if (qualifier.includes("draft")) return 2;
        if (qualifier.includes("review:required")) return 5;
        return 11;
      },
      searchOpenPullRequests: async () => ({
        totalCount: 11,
        pulls: [
          {
            id: "acme/app#1",
            number: 1,
            title: "One",
            url: "https://github.com/acme/app/pull/1",
            repository: "acme/app",
            state: "published",
            needsReview: true,
            createdAt: "2026-08-01T00:00:00Z",
            updatedAt: "2026-08-11T00:00:00Z",
            openCommentCount: 2,
            authorLogin: "lee",
            firstReviewedAt: "2026-08-02T00:00:00Z",
          },
        ],
      }),
      searchMergedPullRequests: async () => ({
        totalCount: 14,
        pulls: [],
      }),
      listRecentlyUpdatedRepos: async () => [
        {
          nameWithOwner: "acme/app",
          updatedAt: "2026-08-11T00:00:00Z",
          url: "https://github.com/acme/app",
        },
      ],
    };

    const settings = {
      createConfiguredClient: async () => ({ client, org: "acme" }),
    } as Pick<GithubSettingsService, "createConfiguredClient">;

    const service = new GithubDashboardService(
      settings as GithubSettingsService,
    );
    const dashboard = await service.getDashboard("u1");
    expect(dashboard.configured).toBe(true);
    expect(dashboard.org).toBe("acme");
    expect(dashboard.metrics.find((m) => m.key === "open_prs")?.value).toBe(
      11,
    );
    expect(dashboard.metrics.find((m) => m.key === "draft_prs")?.value).toBe(
      2,
    );
    expect(
      dashboard.metrics.find((m) => m.key === "published_prs")?.value,
    ).toBe(9);
    expect(
      dashboard.metrics.find((m) => m.key === "needs_review")?.value,
    ).toBe(5);
    expect(dashboard.metrics.find((m) => m.key === "stale_prs")?.value).toBe(
      11,
    );
    expect(
      dashboard.metrics.find((m) => m.key === "merge_rate_weekly")?.value,
    ).toBe(3.3);
    expect(dashboard.authorWip[0]?.login).toBe("lee");
    expect(dashboard.recentPullRequests).toHaveLength(1);
    expect(dashboard.recentRepos).toHaveLength(1);
  });
});
