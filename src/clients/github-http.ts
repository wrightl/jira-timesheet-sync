import { parseGithubAuthenticationTokenExpiration } from "@/lib/github-token-expiry";
import {
  githubRepoSearchQueries,
  githubSearchScope,
  reposMatchingOrg,
} from "@/lib/github-search-scope";

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
    options?: { first?: number; repos?: string[] },
  ): Promise<GithubSearchPullsResult>;
  countOpenPullRequests(
    org: string,
    qualifier?: string,
    repos?: string[],
  ): Promise<number>;
  listRecentlyUpdatedRepos(
    org: string,
    options?: { first?: number; repos?: string[] },
  ): Promise<GithubOrgRepoSummary[]>;
  listOrganizationRepos(
    org: string,
    options?: { max?: number },
  ): Promise<GithubOrgRepoSummary[]>;
  searchMergedPullRequests(
    org: string,
    options?: { first?: number; sinceDays?: number; repos?: string[] },
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

export type GithubAuthInspection = {
  ok: boolean;
  status: number;
  expiresAt: Date | null;
};

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
  return reviewDecision === "REVIEW_REQUIRED";
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

function parseRepoNode(node: unknown): GithubOrgRepoSummary | null {
  const row = asRecord(node);
  if (
    !row ||
    typeof row.nameWithOwner !== "string" ||
    typeof row.updatedAt !== "string" ||
    typeof row.url !== "string"
  ) {
    return null;
  }
  return {
    nameWithOwner: row.nameWithOwner,
    updatedAt: row.updatedAt,
    url: row.url,
  };
}

function filterPullsToSelectedRepos(
  org: string,
  repos: string[] | undefined,
  pulls: GithubPullSummary[],
): GithubPullSummary[] {
  const selected = reposMatchingOrg(org, repos ?? []);
  if (selected.length === 0) return pulls;
  const allow = new Set(selected.map((name) => name.toLowerCase()));
  return pulls.filter((pull) => allow.has(pull.repository.toLowerCase()));
}

function splitNameWithOwner(
  nameWithOwner: string,
): { owner: string; name: string } | null {
  const [owner, name] = nameWithOwner.split("/");
  if (!owner || !name) return null;
  return { owner, name };
}

type OrganizationReposPage = {
  organization?: {
    repositories?: {
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      nodes?: unknown[];
    };
  };
};

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

  private async searchIssueCount(q: string): Promise<number> {
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

  private async sumIssueCounts(queries: string[]): Promise<number> {
    if (queries.length === 0) return 0;
    if (queries.length === 1) return this.searchIssueCount(queries[0]!);

    const chunkSize = 8;
    let total = 0;
    for (let i = 0; i < queries.length; i += chunkSize) {
      const chunk = queries.slice(i, i + chunkSize);
      const varDecls = chunk
        .map((_, idx) => `$q${idx}: String!`)
        .join(", ");
      const fields = chunk
        .map(
          (_, idx) =>
            `c${idx}: search(query: $q${idx}, type: ISSUE, first: 1) { issueCount }`,
        )
        .join("\n");
      const variables: Record<string, string> = {};
      chunk.forEach((query, idx) => {
        variables[`q${idx}`] = query;
      });
      const data = await this.graphql<Record<string, { issueCount?: number }>>(
        `query(${varDecls}) { ${fields} }`,
        variables,
      );
      for (let idx = 0; idx < chunk.length; idx++) {
        const n = data[`c${idx}`]?.issueCount;
        if (typeof n === "number") total += n;
      }
    }
    return total;
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
    repos?: string[],
  ): Promise<number> {
    const extra = `is:pr is:open ${qualifier}`.trim();
    return this.sumIssueCounts(githubRepoSearchQueries(org, repos, extra));
  }

  private async searchPullsByQuery(
    q: string,
    first: number,
  ): Promise<GithubSearchPullsResult> {
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

  async searchOpenPullRequests(
    org: string,
    options?: { first?: number; repos?: string[] },
  ): Promise<GithubSearchPullsResult> {
    const first = Math.min(Math.max(options?.first ?? 20, 1), 100);
    const queries = githubRepoSearchQueries(
      org,
      options?.repos,
      "is:pr is:open sort:updated-desc",
    );
    const pages = await Promise.all(
      queries.map((q) => this.searchPullsByQuery(q, first)),
    );
    const byId = new Map<string, GithubPullSummary>();
    for (const page of pages) {
      for (const pull of page.pulls) {
        byId.set(pull.id, pull);
      }
    }
    const pulls = [...byId.values()].sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    );
    return {
      totalCount: pages.reduce((sum, page) => sum + page.totalCount, 0),
      pulls: filterPullsToSelectedRepos(org, options?.repos, pulls),
    };
  }

  async searchMergedPullRequests(
    org: string,
    options?: { first?: number; sinceDays?: number; repos?: string[] },
  ): Promise<GithubSearchPullsResult> {
    const first = Math.min(Math.max(options?.first ?? 20, 1), 50);
    const sinceDays = Math.min(Math.max(options?.sinceDays ?? 30, 1), 90);
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const extra = `is:pr is:merged merged:>=${since} sort:updated-desc`;
    const q = `${githubSearchScope(org, options?.repos)} ${extra}`.trim();
    const [data, totalCount] = await Promise.all([
      this.graphql<{
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
      ),
      this.sumIssueCounts(
        githubRepoSearchQueries(
          org,
          options?.repos,
          `is:pr is:merged merged:>=${since}`,
        ),
      ),
    ]);

    const nodes = Array.isArray(data.search?.nodes) ? data.search.nodes : [];
    const pulls: GithubPullSummary[] = [];
    for (const node of nodes) {
      const pull = parsePullNode(node);
      if (pull) pulls.push(pull);
    }

    return {
      totalCount,
      pulls: filterPullsToSelectedRepos(org, options?.repos, pulls),
    };
  }

  async listRecentlyUpdatedRepos(
    org: string,
    options?: { first?: number; repos?: string[] },
  ): Promise<GithubOrgRepoSummary[]> {
    const first = Math.min(Math.max(options?.first ?? 10, 1), 50);
    const selected = reposMatchingOrg(org, options?.repos ?? []);
    if (selected.length > 0) {
      const fetched = await Promise.all(
        selected.slice(0, 40).map((nameWithOwner) =>
          this.getRepositorySummary(nameWithOwner),
        ),
      );
      return fetched
        .filter((row): row is GithubOrgRepoSummary => row != null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, first);
    }

    const data = await this.graphql<{
      organization?: {
        repositories?: {
          nodes?: unknown[];
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
      const repo = parseRepoNode(node);
      if (repo) repos.push(repo);
    }
    return repos;
  }

  async listOrganizationRepos(
    org: string,
    options?: { max?: number },
  ): Promise<GithubOrgRepoSummary[]> {
    const max = Math.min(Math.max(options?.max ?? 300, 1), 300);
    const pageSize = 100;
    const repos: GithubOrgRepoSummary[] = [];
    let after: string | null = null;
    while (repos.length < max) {
      const remaining = max - repos.length;
      const first = Math.min(pageSize, remaining);
      const data: OrganizationReposPage = await this.graphql<OrganizationReposPage>(
        `query($org: String!, $first: Int!, $after: String) {
          organization(login: $org) {
            repositories(
              first: $first
              after: $after
              isArchived: false
              orderBy: { field: NAME, direction: ASC }
            ) {
              pageInfo { hasNextPage endCursor }
              nodes {
                nameWithOwner
                updatedAt
                url
              }
            }
          }
        }`,
        { org: org.trim(), first, after },
      );
      const connection = data.organization?.repositories;
      const nodes = connection?.nodes ?? [];
      for (const node of nodes) {
        const repo = parseRepoNode(node);
        if (repo) repos.push(repo);
      }
      const pageInfo = connection?.pageInfo;
      if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
      after = pageInfo.endCursor;
    }
    return repos;
  }

  private async getRepositorySummary(
    nameWithOwner: string,
  ): Promise<GithubOrgRepoSummary | null> {
    const parts = splitNameWithOwner(nameWithOwner);
    if (!parts) return null;
    const data = await this.graphql<{ repository?: unknown }>(
      `query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          nameWithOwner
          updatedAt
          url
        }
      }`,
      { owner: parts.owner, name: parts.name },
    );
    return parseRepoNode(data.repository);
  }

  async inspectAuthentication(): Promise<GithubAuthInspection> {
    return inspectGithubAuthentication({
      token: this.token,
      fetchImpl: this.fetchImpl,
      apiBase: this.apiBase,
    });
  }
}

export async function inspectGithubAuthentication(options: {
  token: string;
  fetchImpl?: GithubFetch;
  apiBase?: string;
}): Promise<GithubAuthInspection> {
  const token = options.token.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBase = (options.apiBase ?? "https://api.github.com").replace(
    /\/$/,
    "",
  );
  const res = await fetchImpl(`${apiBase}/user`, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-Github-Api-Version": "2022-11-28",
    },
  });
  const expiresAt = parseGithubAuthenticationTokenExpiration(
    res.headers.get("github-authentication-token-expiration"),
  );
  if (!res.ok) {
    return { ok: false, status: res.status, expiresAt: null };
  }
  return { ok: true, status: res.status, expiresAt };
}

export function createGithubApiClient(options: {
  token: string;
  fetchImpl?: GithubFetch;
  apiBase?: string;
}): GithubApiClient {
  return new GithubHttpClient(options);
}
