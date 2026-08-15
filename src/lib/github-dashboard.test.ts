import { describe, expect, it } from "vitest";
import type { GithubPullSummary } from "@/clients/github-http";
import {
  authorWipFromPulls,
  filterGithubPulls,
  filterGithubRepos,
  githubDashboardFiltersActive,
  githubReviewNavBadgeFromPulls,
  paginateItems,
  uniqueSortedLabels,
  type GithubDashboardFilters,
} from "@/lib/github-dashboard";

function pull(
  overrides: Partial<GithubPullSummary> & Pick<GithubPullSummary, "id">,
): GithubPullSummary {
  return {
    number: 1,
    title: "Title",
    url: "https://github.com/acme/app/pull/1",
    repository: "acme/app",
    state: "published",
    needsReview: false,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-11T00:00:00Z",
    openCommentCount: 0,
    authorLogin: "lee",
    firstReviewedAt: null,
    ...overrides,
  };
}

const all: GithubDashboardFilters = {
  repository: "",
  author: "",
  state: "all",
  review: "all",
  query: "",
  includeDependabot: true,
};

describe("filterGithubPulls", () => {
  const pulls = [
    pull({ id: "acme/app#1", repository: "acme/app", authorLogin: "lee", state: "draft", needsReview: false, title: "WIP" }),
    pull({ id: "acme/api#2", number: 2, repository: "acme/api", authorLogin: "sam", state: "published", needsReview: true, title: "Fix auth" }),
  ];

  it("returns all pulls when filters are empty", () => {
    expect(filterGithubPulls(pulls, all)).toHaveLength(2);
    expect(githubDashboardFiltersActive(all)).toBe(false);
  });

  it("filters by repository, author, state, review, and query", () => {
    expect(
      filterGithubPulls(pulls, { ...all, repository: "acme/api" }).map((p) => p.id),
    ).toEqual(["acme/api#2"]);
    expect(
      filterGithubPulls(pulls, { ...all, author: "lee" }).map((p) => p.id),
    ).toEqual(["acme/app#1"]);
    expect(
      filterGithubPulls(pulls, { ...all, state: "draft" }).map((p) => p.id),
    ).toEqual(["acme/app#1"]);
    expect(
      filterGithubPulls(pulls, { ...all, review: "needs_review" }).map((p) => p.id),
    ).toEqual(["acme/api#2"]);
    expect(
      filterGithubPulls(pulls, { ...all, query: "auth" }).map((p) => p.id),
    ).toEqual(["acme/api#2"]);
    expect(githubDashboardFiltersActive({ ...all, query: "auth" })).toBe(true);
  });

  it("can exclude Dependabot pull requests", () => {
    const withBot = [
      ...pulls,
      pull({
        id: "acme/app#3",
        number: 3,
        authorLogin: "dependabot[bot]",
        title: "Bump lodash",
      }),
    ];
    expect(
      filterGithubPulls(withBot, { ...all, includeDependabot: false }).map(
        (p) => p.id,
      ),
    ).toEqual(["acme/app#1", "acme/api#2"]);
    expect(
      githubDashboardFiltersActive({ ...all, includeDependabot: false }),
    ).toBe(true);
  });
});

describe("filterGithubRepos", () => {
  const repos = [
    { nameWithOwner: "acme/app", updatedAt: "2026-08-11T00:00:00Z", url: "https://github.com/acme/app" },
    { nameWithOwner: "acme/api", updatedAt: "2026-08-10T00:00:00Z", url: "https://github.com/acme/api" },
  ];

  it("filters by repository and query", () => {
    expect(filterGithubRepos(repos, { repository: "acme/app", query: "" })).toHaveLength(1);
    expect(filterGithubRepos(repos, { repository: "", query: "api" })[0]?.nameWithOwner).toBe("acme/api");
  });
});

describe("authorWipFromPulls", () => {
  it("counts open PRs per author", () => {
    const wip = authorWipFromPulls([
      pull({ id: "1", authorLogin: "lee" }),
      pull({ id: "2", authorLogin: "lee" }),
      pull({ id: "3", authorLogin: "sam" }),
      pull({ id: "4", authorLogin: null }),
    ]);
    expect(wip).toEqual([
      { login: "lee", openCount: 2 },
      { login: "sam", openCount: 1 },
    ]);
  });
});

describe("uniqueSortedLabels", () => {
  it("dedupes case-insensitively", () => {
    expect(uniqueSortedLabels(["sam", "Lee", "lee", null, ""])).toEqual([
      "Lee",
      "sam",
    ]);
  });
});

describe("paginateItems", () => {
  it("returns a page of items and clamps out-of-range pages", () => {
    const items = [1, 2, 3, 4, 5];
    expect(paginateItems(items, 1, 2)).toMatchObject({
      items: [1, 2],
      page: 1,
      from: 1,
      to: 2,
      total: 5,
      canPrev: false,
      canNext: true,
    });
    expect(paginateItems(items, 3, 2)).toMatchObject({
      items: [5],
      page: 3,
      from: 5,
      to: 5,
      canPrev: true,
      canNext: false,
    });
    expect(paginateItems(items, 99, 2).page).toBe(3);
    expect(paginateItems([], 4, 10)).toMatchObject({
      items: [],
      page: 1,
      from: 0,
      to: 0,
      total: 0,
      canPrev: false,
      canNext: false,
    });
  });
});

describe("githubReviewNavBadgeFromPulls", () => {
  const now = new Date("2026-08-12T12:00:00.000Z"); // Wednesday

  it("counts non-Dependabot PRs that need review and flags stale uncommented ones", () => {
    expect(
      githubReviewNavBadgeFromPulls(
        [
          pull({
            id: "1",
            needsReview: true,
            openCommentCount: 0,
            createdAt: "2026-08-11T09:00:00.000Z",
            authorLogin: "lee",
          }),
          pull({
            id: "2",
            needsReview: true,
            openCommentCount: 2,
            createdAt: "2026-08-01T00:00:00.000Z",
            authorLogin: "sam",
          }),
          pull({
            id: "3",
            needsReview: true,
            openCommentCount: 0,
            createdAt: "2026-08-01T00:00:00.000Z",
            authorLogin: "dependabot[bot]",
          }),
          pull({
            id: "4",
            needsReview: false,
            openCommentCount: 0,
            createdAt: "2026-08-01T00:00:00.000Z",
            authorLogin: "lee",
          }),
        ],
        now,
      ),
    ).toEqual({ count: 2, urgent: true });
  });

  it("does not flag PRs younger than 24 weekday hours", () => {
    expect(
      githubReviewNavBadgeFromPulls(
        [
          pull({
            id: "1",
            needsReview: true,
            openCommentCount: 0,
            createdAt: "2026-08-12T00:00:00.000Z",
            authorLogin: "lee",
          }),
        ],
        now,
      ),
    ).toEqual({ count: 1, urgent: false });
  });

  it("excludes weekend hours when deciding urgency", () => {
    const monday = new Date("2026-08-17T10:00:00.000Z");
    expect(
      githubReviewNavBadgeFromPulls(
        [
          pull({
            id: "1",
            needsReview: true,
            openCommentCount: 0,
            createdAt: "2026-08-14T17:00:00.000Z", // Friday; 16 weekday hours by Monday 10:00
            authorLogin: "lee",
          }),
        ],
        monday,
      ),
    ).toEqual({ count: 1, urgent: false });
    expect(
      githubReviewNavBadgeFromPulls(
        [
          pull({
            id: "1",
            needsReview: true,
            openCommentCount: 0,
            createdAt: "2026-08-14T09:00:00.000Z",
            authorLogin: "lee",
          }),
        ],
        monday,
      ),
    ).toEqual({ count: 1, urgent: true });
  });

  it("counts only PRs in the selected repositories", () => {
    expect(
      githubReviewNavBadgeFromPulls(
        [
          pull({
            id: "acme/app#1",
            repository: "acme/app",
            needsReview: true,
            openCommentCount: 0,
            createdAt: "2026-08-01T00:00:00.000Z",
            authorLogin: "lee",
          }),
          pull({
            id: "acme/other#2",
            number: 2,
            repository: "acme/other",
            needsReview: true,
            openCommentCount: 0,
            createdAt: "2026-08-01T00:00:00.000Z",
            authorLogin: "sam",
          }),
        ],
        now,
        ["acme/app"],
      ),
    ).toEqual({ count: 1, urgent: true });
  });
});
