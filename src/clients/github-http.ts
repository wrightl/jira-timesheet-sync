export type GithubPullState = "draft" | "published";

export type GithubPullSummary = {
  id: string;
  number: number;
  title: string;
  url: string;
  repository: string;
  state: GithubPullState;
  needsReview: boolean;
  createdAt: string;
  updatedAt: string;
  openCommentCount: number;
  authorLogin: string | null;
  firstReviewedAt: string | null;
};

export type GithubSearchPullsResult = {
  totalCount: number;
  pulls: GithubPullSummary[];
};

export type GithubOrgRepoSummary = {
  nameWithOwner: string;
  updatedAt: string;
  url: string;
};

export interface GithubApiClient {
  getViewerLogin(): Promise<string>;
  searchOpenPullRequests(
    org: string,
    options?: { first?: number },
  ): Promise<GithubSearchPullsResult>;
  countOpenPullRequests(org: string, qualifier?: string): Promise<number>;
  listRecentlyUpdatedRepos(
    org: string,
    options?: { first?: number },
  ): Promise<GithubOrgRepoSummary[]>;
  searchMergedPullRequests(
    org: string,
    options?: { first?: number; sinceDays?: number },
  ): Promise<GithubSearchPullsResult>;
}

export class GithubHttpError extends Error {
  readonly status: number;
  readonly bodySnippet: string;

  constructor(status: number, bodySnippet: string, path: string) {
    super(`GitHub API ${path} failed (${status}): ${bodySnippet}`);
    this.name = "GithubHttpError";
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

export type GithubFetch = typeof fetch;

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function needsReviewFromDecision(
  isDraft: boolean,
  reviewDecision: string | null,
): boolean {
  if (isDraft) return false;
  return (
    reviewDecision === null ||
    reviewDecision === "REVIEW_REQUIRED" ||
    reviewDecision === "CHANGES_REQUESTED"
  );
}

function openCommentCountFromNode(node: Record<string, unknown>): number {
  const comments = asRecord(node.comments);
  const issueComments =
    comments && typeof comments.totalCount === "number"
      ? comments.totalCount
      : 0;
  const threads = asRecord(node.reviewThreads);
  const threadNodes = Array.isArray(threads?.nodes) ? threads.nodes : [];
  let unresolved = 0;
  for (const item of threadNodes) {
    const row = asRecord(item);
    if (row && row.isResolved === false) unresolved += 1;
  }
  return issueComments + unresolved;
}

function firstReviewedAtFromNode(node: Record<string, unknown>): string | null {
  const reviews = asRecord(node.reviews);
  const nodes = Array.isArray(reviews?.nodes) ? reviews.nodes : [];
  let earliest: string | null = null;
  for (const item of nodes) {
    const row = asRecord(item);
    const submitted =
      row && typeof row.submittedAt === "string" ? row.submittedAt : null;
    if (!submitted) continue;
    if (!earliest || Date.parse(submitted) < Date.parse(earliest)) {
      earliest = submitted;
    }
  }
  return earliest;
}

function parsePullNode(node: unknown): GithubPullSummary | null {
  const row = asRecord(node);
  if (!row || typeof row.number !== "number" || typeof row.title !== "string") {
    return null;
  }
  const repo = asRecord(row.repository);
  const repository =
    repo && typeof repo.nameWithOwner === "string" ? repo.nameWithOwner : "";
  const isDraft = row.isDraft === true;
  const reviewDecision =
    typeof row.reviewDecision === "string" ? row.reviewDecision : null;
  const url = typeof row.url === "string" ? row.url : "";
  const createdAt = typeof row.createdAt === "string" ? row.createdAt : "";
  const updatedAt = typeof row.updatedAt === "string" ? row.updatedAt : "";
  if (!url || !createdAt || !updatedAt) return null;
  const author = asRecord(row.author);
  const authorLogin =
    author && typeof author.login === "string" ? author.login : null;

  return {
    id: `${repository}#${row.number}`,
    number: row.number,
    title: row.title,
    url,
    repository,
    state: isDraft ? "draft" : "published",
    needsReview: needsReviewFromDecision(isDraft, reviewDecision),
    createdAt,
    updatedAt,
    openCommentCount: openCommentCountFromNode(row),
    authorLogin,
    firstReviewedAt: firstReviewedAtFromNode(row),
  };
}

const PULL_NODE_FIELDS = `
  number
  title
  url
  isDraft
  createdAt
  updatedAt
  reviewDecision
  author { login }
  comments { totalCount }
  reviewThreads(first: 100) {
    nodes { isResolved }
  }
  reviews(first: 10, states: [APPROVED, CHANGES_REQUESTED, COMMENTED]) {
    nodes { submittedAt }
  }
  repository { nameWithOwner }
`;

export class GithubHttpClient implements GithubApiClient {
  private readonly token: string;
  private readonly fetchImpl: GithubFetch;
  private readonly apiBase: string;

  constructor(options: {
    token: string;
    fetchImpl?: GithubFetch;
    apiBase?: string;
  }) {
    this.token = options.token.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.apiBase = (options.apiBase ?? "https://api.github.com").replace(
      /\/$/,
      "",
    );
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.apiBase}/graphql`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "X-Github-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ query, variables }),
    });

    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    if (!res.ok) {
      throw new GithubHttpError(
        res.status,
        text.slice(0, 300) || res.statusText,
        "/graphql",
      );
    }

    const payload = asRecord(json) as GraphqlResponse<T> | null;
    if (!payload) {
      throw new GithubHttpError(500, "Invalid GraphQL response", "/graphql");
    }
    if (payload.errors?.length) {
      const message = payload.errors
        .map((e) => e.message ?? "GraphQL error")
        .join("; ");
      throw new GithubHttpError(400, message.slice(0, 300), "/graphql");
    }
    if (!payload.data) {
      throw new GithubHttpError(500, "Missing GraphQL data", "/graphql");
    }
    return payload.data;
  }

  async getViewerLogin(): Promise<string> {
    const data = await this.graphql<{ viewer?: { login?: string } }>(
      `query { viewer { login } }`,
      {},
    );
    const login = data.viewer?.login;
    if (!login) throw new GithubHttpError(500, "Missing viewer login", "/graphql");
    return login;
  }

  async countOpenPullRequests(
    org: string,
    qualifier = "",
  ): Promise<number> {
    const q = `org:${org.trim()} is:pr is:open ${qualifier}`.trim();
    const data = await this.graphql<{ search?: { issueCount?: number } }>(
      `query($q: String!) {
        search(query: $q, type: ISSUE, first: 1) {
          issueCount
        }
      }`,
      { q },
    );
    return typeof data.search?.issueCount === "number"
      ? data.search.issueCount
      : 0;
  }

  async searchOpenPullRequests(
    org: string,
    options?: { first?: number },
  ): Promise<GithubSearchPullsResult> {
    const first = Math.min(Math.max(options?.first ?? 20, 1), 50);
    const q = `org:${org.trim()} is:pr is:open sort:updated-desc`;
    const data = await this.graphql<{
      search?: { issueCount?: number; nodes?: unknown[] };
    }>(
      `query($q: String!, $first: Int!) {
        search(query: $q, type: ISSUE, first: $first) {
          issueCount
          nodes {
            ... on PullRequest {
              ${PULL_NODE_FIELDS}
            }
          }
        }
      }`,
      { q, first },
    );

    const nodes = Array.isArray(data.search?.nodes) ? data.search.nodes : [];
    const pulls: GithubPullSummary[] = [];
    for (const node of nodes) {
      const pull = parsePullNode(node);
      if (pull) pulls.push(pull);
    }

    return {
      totalCount:
        typeof data.search?.issueCount === "number"
          ? data.search.issueCount
          : pulls.length,
      pulls,
    };
  }

  async searchMergedPullRequests(
    org: string,
    options?: { first?: number; sinceDays?: number },
  ): Promise<GithubSearchPullsResult> {
    const first = Math.min(Math.max(options?.first ?? 20, 1), 50);
    const sinceDays = Math.min(Math.max(options?.sinceDays ?? 30, 1), 90);
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const q = `org:${org.trim()} is:pr is:merged merged:>=${since} sort:updated-desc`;
    const data = await this.graphql<{
      search?: { issueCount?: number; nodes?: unknown[] };
    }>(
      `query($q: String!, $first: Int!) {
        search(query: $q, type: ISSUE, first: $first) {
          issueCount
          nodes {
            ... on PullRequest {
              ${PULL_NODE_FIELDS}
            }
          }
        }
      }`,
      { q, first },
    );

    const nodes = Array.isArray(data.search?.nodes) ? data.search.nodes : [];
    const pulls: GithubPullSummary[] = [];
    for (const node of nodes) {
      const pull = parsePullNode(node);
      if (pull) pulls.push(pull);
    }

    return {
      totalCount:
        typeof data.search?.issueCount === "number"
          ? data.search.issueCount
          : pulls.length,
      pulls,
    };
  }

  async listRecentlyUpdatedRepos(
    org: string,
    options?: { first?: number },
  ): Promise<GithubOrgRepoSummary[]> {
    const first = Math.min(Math.max(options?.first ?? 10, 1), 50);
    const data = await this.graphql<{
      organization?: {
        repositories?: {
          nodes?: Array<{
            nameWithOwner?: string;
            updatedAt?: string;
            url?: string;
          } | null>;
        };
      };
    }>(
      `query($org: String!, $first: Int!) {
        organization(login: $org) {
          repositories(
            first: $first
            orderBy: { field: UPDATED_AT, direction: DESC }
          ) {
            nodes {
              nameWithOwner
              updatedAt
              url
            }
          }
        }
      }`,
      { org: org.trim(), first },
    );

    const nodes = data.organization?.repositories?.nodes ?? [];
    const repos: GithubOrgRepoSummary[] = [];
    for (const node of nodes) {
      if (
        node &&
        typeof node.nameWithOwner === "string" &&
        typeof node.updatedAt === "string" &&
        typeof node.url === "string"
      ) {
        repos.push({
          nameWithOwner: node.nameWithOwner,
          updatedAt: node.updatedAt,
          url: node.url,
        });
      }
    }
    return repos;
  }
}

export function createGithubApiClient(options: {
  token: string;
  fetchImpl?: GithubFetch;
  apiBase?: string;
}): GithubApiClient {
  return new GithubHttpClient(options);
}
