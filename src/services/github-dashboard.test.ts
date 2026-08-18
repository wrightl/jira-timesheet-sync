import { describe, expect, it, vi } from "vitest";
import { GithubHttpClient, inspectGithubAuthentication } from "@/clients/github-http";
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
            issueCount: 3,
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
                {
                  number: 8,
                  title: "No review required",
                  url: "https://github.com/acme/app/pull/8",
                  isDraft: false,
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
    expect(result.totalCount).toBe(3);
    expect(result.pulls.find((p) => p.number === 12)).toMatchObject({
      state: "published",
      needsReview: true,
      openCommentCount: 4,
      repository: "acme/app",
    });
    expect(result.pulls.find((p) => p.number === 9)).toMatchObject({
      state: "draft",
      needsReview: false,
      openCommentCount: 0,
    });
    expect(result.pulls.find((p) => p.number === 8)).toMatchObject({
      state: "published",
      needsReview: false,
    });
  });

  it("searches each selected repository separately", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        variables?: { q?: string };
      };
      const q = body.variables?.q ?? "";
      const repo = q.includes("repo:acme/app") ? "acme/app" : "acme/api";
      return new Response(
        JSON.stringify({
          data: {
            search: {
              issueCount: 1,
              nodes: [
                {
                  number: repo === "acme/app" ? 1 : 2,
                  title: "PR",
                  url: `https://github.com/${repo}/pull/1`,
                  isDraft: false,
                  createdAt: "2026-08-01T00:00:00Z",
                  updatedAt: "2026-08-11T00:00:00Z",
                  reviewDecision: "REVIEW_REQUIRED",
                  comments: { totalCount: 0 },
                  reviewThreads: { nodes: [] },
                  repository: { nameWithOwner: repo },
                  author: { login: "lee" },
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
    const result = await client.searchOpenPullRequests("acme", {
      first: 20,
      repos: ["acme/app", "acme/api"],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.pulls.map((pull) => pull.repository).sort()).toEqual([
      "acme/api",
      "acme/app",
    ]);
  });
});

describe("GithubHttpClient.countOpenPullRequests", () => {
  it("sums issue counts for each selected repository", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          data: {
            c0: { issueCount: 3 },
            c1: { issueCount: 5 },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = new GithubHttpClient({
      token: "ghp_test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const total = await client.countOpenPullRequests("acme", "", [
      "acme/app",
      "acme/api",
    ]);
    expect(total).toBe(8);
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body ?? "{}")) as {
      query?: string;
      variables?: Record<string, string>;
    };
    expect(body.query).toContain("$q0");
    expect(body.query).toContain("$q1");
    expect(body.variables).toEqual({
      q0: "repo:acme/app is:pr is:open",
      q1: "repo:acme/api is:pr is:open",
    });
  });
});

describe("inspectGithubAuthentication", () => {
  it("reads the token expiration header", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ login: "lee" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "github-authentication-token-expiration": "2026-09-01 00:00:00 UTC",
        },
      });
    });
    const result = await inspectGithubAuthentication({
      token: "ghp_test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(true);
    expect(result.expiresAt?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("returns not-ok without expiry on 401", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response("Bad credentials", { status: 401 });
    });
    const result = await inspectGithubAuthentication({
      token: "ghp_bad",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.expiresAt).toBeNull();
  });
});

describe("GithubDashboardService", () => {
  it("returns unconfigured when credentials missing", async () => {
    const settings = {
      createConfiguredClient: async () => null,
      getStatus: async () => ({
        hasToken: false,
        maskedToken: null,
        githubOrg: null,
        tokenExpiresAt: null,
        githubRepos: [],
        configured: false,
      }),
    } as Pick<GithubSettingsService, "createConfiguredClient" | "getStatus">;
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
      listOrganizationRepos: async () => [],
    };

    const settings = {
      createConfiguredClient: async () => ({ client, org: "acme" }),
      getStatus: async () => ({
        hasToken: true,
        maskedToken: "ghp_****",
        githubOrg: "acme",
        tokenExpiresAt: "2026-09-01T00:00:00.000Z",
        githubRepos: [],
        configured: true,
      }),
    } as Pick<GithubSettingsService, "createConfiguredClient" | "getStatus">;

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
    expect(dashboard.tokenExpiresAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("passes selected repos into GitHub queries", async () => {
    const countOpenPullRequests = vi.fn(async () => 1);
    const searchOpenPullRequests = vi.fn(async () => ({
      totalCount: 0,
      pulls: [],
    }));
    const searchMergedPullRequests = vi.fn(async () => ({
      totalCount: 0,
      pulls: [],
    }));
    const listRecentlyUpdatedRepos = vi.fn(async () => []);
    const client: GithubApiClient = {
      getViewerLogin: async () => "lee",
      countOpenPullRequests,
      searchOpenPullRequests,
      searchMergedPullRequests,
      listRecentlyUpdatedRepos,
      listOrganizationRepos: async () => [],
    };
    const selected = ["acme/app", "acme/api"];
    const settings = {
      createConfiguredClient: async () => ({ client, org: "acme" }),
      getStatus: async () => ({
        hasToken: true,
        maskedToken: "ghp_****",
        githubOrg: "acme",
        tokenExpiresAt: null,
        githubRepos: selected,
        configured: true,
      }),
    } as Pick<GithubSettingsService, "createConfiguredClient" | "getStatus">;

    const dashboard = await new GithubDashboardService(
      settings as GithubSettingsService,
    ).getDashboard("u1");

    expect(dashboard.githubRepos).toEqual(selected);
    expect(dashboard.metrics.find((m) => m.key === "open_prs")?.hint).toBe(
      "2 selected repositories",
    );
    expect(countOpenPullRequests).toHaveBeenCalledWith("acme", "", selected);
    expect(searchOpenPullRequests).toHaveBeenCalledWith("acme", {
      first: 100,
      repos: selected,
    });
    expect(searchMergedPullRequests).toHaveBeenCalledWith("acme", {
      first: 20,
      sinceDays: 30,
      repos: selected,
    });
    expect(listRecentlyUpdatedRepos).toHaveBeenCalledWith("acme", {
      first: 40,
      repos: selected,
    });
  });

  it("builds a review nav badge from open pulls", async () => {
    const searchOpenPullRequests = vi.fn(async () => ({
      totalCount: 2,
      pulls: [
        {
          id: "acme/app#1",
          number: 1,
          title: "Needs review",
          url: "https://github.com/acme/app/pull/1",
          repository: "acme/app",
          state: "published" as const,
          needsReview: true,
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-11T00:00:00Z",
          openCommentCount: 0,
          authorLogin: "lee",
          firstReviewedAt: null,
        },
        {
          id: "acme/app#2",
          number: 2,
          title: "Bot",
          url: "https://github.com/acme/app/pull/2",
          repository: "acme/app",
          state: "published" as const,
          needsReview: true,
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-11T00:00:00Z",
          openCommentCount: 0,
          authorLogin: "dependabot[bot]",
          firstReviewedAt: null,
        },
        {
          id: "acme/other#9",
          number: 9,
          title: "Other repo",
          url: "https://github.com/acme/other/pull/9",
          repository: "acme/other",
          state: "published" as const,
          needsReview: true,
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-11T00:00:00Z",
          openCommentCount: 0,
          authorLogin: "sam",
          firstReviewedAt: null,
        },
      ],
    }));
    const client: GithubApiClient = {
      getViewerLogin: async () => "lee",
      countOpenPullRequests: async () => 0,
      searchOpenPullRequests,
      searchMergedPullRequests: async () => ({ totalCount: 0, pulls: [] }),
      listRecentlyUpdatedRepos: async () => [],
      listOrganizationRepos: async () => [],
    };
    const settings = {
      createConfiguredClient: async () => ({ client, org: "acme" }),
      getStatus: async () => ({
        hasToken: true,
        maskedToken: "ghp_****",
        githubOrg: "acme",
        tokenExpiresAt: null,
        githubRepos: ["acme/app"],
        configured: true,
      }),
    } as Pick<GithubSettingsService, "createConfiguredClient" | "getStatus">;

    const badge = await new GithubDashboardService(
      settings as GithubSettingsService,
    ).getReviewNavBadge("u1");

    expect(badge).toEqual({ count: 1, urgent: true });
    expect(searchOpenPullRequests).toHaveBeenCalledWith("acme", {
      first: 100,
      repos: ["acme/app"],
    });
  });
});

describe("GithubHttpClient.listOrganizationRepos", () => {
  it("follows a second GraphQL page", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        variables?: { after?: string | null };
      };
      if (!body.variables?.after) {
        return new Response(
          JSON.stringify({
            data: {
              organization: {
                repositories: {
                  pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
                  nodes: [
                    {
                      nameWithOwner: "acme/a",
                      updatedAt: "2026-08-01T00:00:00Z",
                      url: "https://github.com/acme/a",
                    },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            organization: {
              repositories: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    nameWithOwner: "acme/b",
                    updatedAt: "2026-08-02T00:00:00Z",
                    url: "https://github.com/acme/b",
                  },
                ],
              },
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
    const repos = await client.listOrganizationRepos("acme");
    expect(repos.map((r) => r.nameWithOwner)).toEqual(["acme/a", "acme/b"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
