import type {
  GithubOrgRepoSummary,
  GithubPullSummary,
} from "@/clients/github-http";
import { weekdayHoursBetween } from "@/lib/weekday-hours";

export type GithubDashboardMetric = {
  key: string;
  label: string;
  value: number | null;
  status: "ok" | "watch" | "risk" | "unavailable";
  hint?: string;
};

export type GithubAuthorWip = {
  login: string;
  openCount: number;
};

export type GithubDashboardResult = {
  configured: boolean;
  org: string | null;
  tokenExpiresAt: string | null;
  githubRepos: string[];
  metrics: GithubDashboardMetric[];
  recentPullRequests: GithubPullSummary[];
  recentRepos: GithubOrgRepoSummary[];
  authorWip: GithubAuthorWip[];
  error: string | null;
};

export type GithubPullStateFilter = "all" | "draft" | "published";
export type GithubReviewFilter = "all" | "needs_review" | "reviewed";

export type GithubDashboardFilters = {
  repository: string;
  author: string;
  state: GithubPullStateFilter;
  review: GithubReviewFilter;
  query: string;
  includeDependabot: boolean;
};

export const EMPTY_GITHUB_DASHBOARD_FILTERS: GithubDashboardFilters = {
  repository: "",
  author: "",
  state: "all",
  review: "all",
  query: "",
  includeDependabot: true,
};

export const GITHUB_TABLE_PAGE_SIZE = 10;
export const GITHUB_REVIEW_STALE_WEEKDAY_HOURS = 24;

export type GithubReviewNavBadge = {
  count: number;
  urgent: boolean;
};

export function githubReviewNavBadgeFromPulls(
  pulls: GithubPullSummary[],
  now: Date = new Date(),
  repositories: string[] = [],
): GithubReviewNavBadge {
  const allow = new Set(
    repositories.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const needingReview = pulls.filter((pull) => {
    if (!pull.needsReview || isDependabotAuthor(pull.authorLogin)) return false;
    if (allow.size > 0 && !allow.has(pull.repository.toLowerCase())) {
      return false;
    }
    return true;
  });
  const urgent = needingReview.some((pull) => {
    if (pull.openCommentCount > 0) return false;
    const created = new Date(pull.createdAt);
    if (Number.isNaN(created.getTime())) return false;
    return (
      weekdayHoursBetween(created, now) > GITHUB_REVIEW_STALE_WEEKDAY_HOURS
    );
  });
  return { count: needingReview.length, urgent };
}

export type PaginatedItems<T> = {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  canPrev: boolean;
  canNext: boolean;
};

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number = GITHUB_TABLE_PAGE_SIZE,
): PaginatedItems<T> {
  const total = items.length;
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(Math.floor(page) || 1, 1), pageCount);
  const start = (safePage - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: safePage,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + size, total),
    canPrev: safePage > 1,
    canNext: safePage < pageCount && total > 0,
  };
}

export function isDependabotAuthor(
  login: string | null | undefined,
): boolean {
  if (!login) return false;
  const normalised = login.trim().toLowerCase();
  return (
    normalised === "dependabot" ||
    normalised.startsWith("dependabot[") ||
    normalised.startsWith("dependabot-")
  );
}

export function githubDashboardFiltersActive(
  filters: GithubDashboardFilters,
): boolean {
  return (
    filters.repository !== "" ||
    filters.author !== "" ||
    filters.state !== "all" ||
    filters.review !== "all" ||
    filters.query.trim() !== "" ||
    filters.includeDependabot === false
  );
}

export function uniqueSortedLabels(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(trimmed);
  }
  return labels.sort((a, b) => a.localeCompare(b));
}

export function filterGithubPulls(
  pulls: GithubPullSummary[],
  filters: GithubDashboardFilters,
): GithubPullSummary[] {
  const query = filters.query.trim().toLowerCase();
  const repository = filters.repository.trim().toLowerCase();
  const author = filters.author.trim().toLowerCase();

  return pulls.filter((pull) => {
    if (repository && pull.repository.toLowerCase() !== repository) {
      return false;
    }
    if (author && (pull.authorLogin ?? "").toLowerCase() !== author) {
      return false;
    }
    if (filters.state !== "all" && pull.state !== filters.state) {
      return false;
    }
    if (filters.review === "needs_review" && !pull.needsReview) {
      return false;
    }
    if (filters.review === "reviewed" && pull.needsReview) {
      return false;
    }
    if (!filters.includeDependabot && isDependabotAuthor(pull.authorLogin)) {
      return false;
    }
    if (query) {
      const haystack = `${pull.repository}#${pull.number} ${pull.title} ${pull.authorLogin ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function filterGithubRepos(
  repos: GithubOrgRepoSummary[],
  filters: Pick<GithubDashboardFilters, "repository" | "query">,
): GithubOrgRepoSummary[] {
  const query = filters.query.trim().toLowerCase();
  const repository = filters.repository.trim().toLowerCase();
  return repos.filter((repo) => {
    if (repository && repo.nameWithOwner.toLowerCase() !== repository) {
      return false;
    }
    if (query && !repo.nameWithOwner.toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });
}

export function authorWipFromPulls(pulls: GithubPullSummary[]): GithubAuthorWip[] {
  const byAuthor = new Map<string, number>();
  for (const pull of pulls) {
    if (!pull.authorLogin) continue;
    byAuthor.set(pull.authorLogin, (byAuthor.get(pull.authorLogin) ?? 0) + 1);
  }
  return [...byAuthor.entries()]
    .map(([login, openCount]) => ({ login, openCount }))
    .sort((a, b) => b.openCount - a.openCount || a.login.localeCompare(b.login))
    .slice(0, 10);
}

export function formatPullAge(
  createdAt: string,
  now: Date = new Date(),
): string {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "—";
  const ms = Math.max(now.getTime() - created.getTime(), 0);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}
