import type {
  GithubApiClient,
  GithubOrgRepoSummary,
  GithubPullSummary,
} from "@/clients/github-http";
import {
  githubReviewNavBadgeFromPulls,
  type GithubAuthorWip,
  type GithubDashboardMetric,
  type GithubDashboardResult,
  type GithubReviewNavBadge,
} from "@/lib/github-dashboard";
import {
  createGithubSettingsService,
  type GithubSettingsService,
} from "@/services/github-settings-service";

export type {
  GithubAuthorWip,
  GithubDashboardMetric,
  GithubDashboardResult,
  GithubReviewNavBadge,
} from "@/lib/github-dashboard";
export { formatPullAge } from "@/lib/github-dashboard";

function metricStatus(
  value: number,
  watchAt: number,
  riskAt: number,
): "ok" | "watch" | "risk" {
  if (value >= riskAt) return "risk";
  if (value >= watchAt) return "watch";
  return "ok";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function hoursBetween(startIso: string, end: Date): number | null {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return null;
  return Math.max(0, (end.getTime() - start) / (60 * 60 * 1000));
}

export function computeFlowMetrics(
  openPulls: GithubPullSummary[],
  options?: { now?: Date; staleDays?: number },
): {
  medianOpenAgeHours: number | null;
  medianTimeToFirstReviewHours: number | null;
  staleCount: number;
  authorWip: GithubAuthorWip[];
} {
  const now = options?.now ?? new Date();
  const staleDays = options?.staleDays ?? 7;
  const ages: number[] = [];
  const reviewLags: number[] = [];
  let staleCount = 0;
  const byAuthor = new Map<string, number>();

  for (const pull of openPulls) {
    const age = hoursBetween(pull.createdAt, now);
    if (age != null) ages.push(age);
    const updatedAge = hoursBetween(pull.updatedAt, now);
    if (updatedAge != null && updatedAge >= staleDays * 24) staleCount += 1;
    if (pull.firstReviewedAt) {
      const lag = hoursBetween(
        pull.createdAt,
        new Date(pull.firstReviewedAt),
      );
      if (lag != null) reviewLags.push(lag);
    }
    if (pull.authorLogin) {
      byAuthor.set(pull.authorLogin, (byAuthor.get(pull.authorLogin) ?? 0) + 1);
    }
  }

  const authorWip = [...byAuthor.entries()]
    .map(([login, openCount]) => ({ login, openCount }))
    .sort((a, b) => b.openCount - a.openCount)
    .slice(0, 10);

  const medianOpenAgeHours = median(ages);
  const medianTimeToFirstReviewHours = median(reviewLags);

  return {
    medianOpenAgeHours:
      medianOpenAgeHours != null
        ? Math.round(medianOpenAgeHours * 10) / 10
        : null,
    medianTimeToFirstReviewHours:
      medianTimeToFirstReviewHours != null
        ? Math.round(medianTimeToFirstReviewHours * 10) / 10
        : null,
    staleCount,
    authorWip,
  };
}

export class GithubDashboardService {
  constructor(private readonly settings: GithubSettingsService) {}

  async getDashboard(userId: string): Promise<GithubDashboardResult> {
    const [configured, status] = await Promise.all([
      this.settings.createConfiguredClient(userId),
      this.settings.getStatus(userId),
    ]);
    const tokenExpiresAt = status.tokenExpiresAt;
    const githubRepos = status.githubRepos;
    if (!configured) {
      return {
        configured: false,
        org: null,
        tokenExpiresAt,
        githubRepos,
        metrics: [],
        recentPullRequests: [],
        recentRepos: [],
        authorWip: [],
        error: null,
      };
    }

    const { client, org } = configured;
    try {
      const dashboard = await this.buildDashboard(client, org, githubRepos);
      return { ...dashboard, tokenExpiresAt, githubRepos };
    } catch (err) {
      return {
        configured: true,
        org,
        tokenExpiresAt,
        githubRepos,
        metrics: [],
        recentPullRequests: [],
        recentRepos: [],
        authorWip: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async getReviewNavBadge(userId: string): Promise<GithubReviewNavBadge> {
    const empty: GithubReviewNavBadge = { count: 0, urgent: false };
    const [configured, status] = await Promise.all([
      this.settings.createConfiguredClient(userId),
      this.settings.getStatus(userId),
    ]);
    if (!configured) return empty;

    try {
      const repos =
        status.githubRepos.length > 0 ? status.githubRepos : undefined;
      const recent = await configured.client.searchOpenPullRequests(
        configured.org,
        { first: 100, repos },
      );
      return githubReviewNavBadgeFromPulls(recent.pulls, new Date(), status.githubRepos);
    } catch {
      return empty;
    }
  }

  private async buildDashboard(
    client: GithubApiClient,
    org: string,
    githubRepos: string[],
  ): Promise<GithubDashboardResult> {
    const staleCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const repos = githubRepos.length > 0 ? githubRepos : undefined;
    const scopeHint =
      githubRepos.length > 0
        ? `${githubRepos.length} selected ${githubRepos.length === 1 ? "repository" : "repositories"}`
        : `Across ${org}`;

    const [
      openCount,
      draftCount,
      needsReviewCount,
      staleCountSearch,
      merged,
      recent,
      recentRepos,
    ] = await Promise.all([
      client.countOpenPullRequests(org, "", repos),
      client.countOpenPullRequests(org, "is:draft", repos),
      client.countOpenPullRequests(org, "review:required", repos),
      client.countOpenPullRequests(org, `updated:<${staleCutoff}`, repos),
      client.searchMergedPullRequests(org, { first: 20, sinceDays: 30, repos }),
      client.searchOpenPullRequests(org, { first: 100, repos }),
      client.listRecentlyUpdatedRepos(org, { first: 40, repos }),
    ]);

    const published = Math.max(openCount - draftCount, 0);
    const flow = computeFlowMetrics(recent.pulls);
    const mergeRatePerWeek =
      Math.round((merged.totalCount / (30 / 7)) * 10) / 10;

    const hint = (detail?: string) =>
      detail ? `${scopeHint} · ${detail}` : scopeHint;

    const metrics: GithubDashboardMetric[] = [
      {
        key: "open_prs",
        label: "Open pull requests",
        value: openCount,
        status: metricStatus(openCount, 25, 50),
        hint: scopeHint,
      },
      {
        key: "draft_prs",
        label: "Draft PRs",
        value: draftCount,
        status: "ok",
        hint: scopeHint,
      },
      {
        key: "published_prs",
        label: "Published open PRs",
        value: published,
        status: metricStatus(published, 20, 40),
        hint: scopeHint,
      },
      {
        key: "needs_review",
        label: "PRs needing review",
        value: needsReviewCount,
        status: metricStatus(needsReviewCount, 10, 20),
        hint: hint("GitHub review:required"),
      },
      {
        key: "stale_prs",
        label: "Stale PRs (7d+)",
        value: staleCountSearch,
        status: metricStatus(staleCountSearch, 5, 12),
        hint: hint("No updates in 7+ days"),
      },
      {
        key: "median_open_age_h",
        label: "Median open age (h)",
        value: flow.medianOpenAgeHours,
        status:
          flow.medianOpenAgeHours == null
            ? "unavailable"
            : metricStatus(flow.medianOpenAgeHours, 48, 120),
    hint: hint("Sample of recent open PRs (up to 100)"),
      },
      {
        key: "median_ttf_review_h",
        label: "Median time to first review (h)",
        value: flow.medianTimeToFirstReviewHours,
        status:
          flow.medianTimeToFirstReviewHours == null
            ? "unavailable"
            : metricStatus(flow.medianTimeToFirstReviewHours, 24, 72),
        hint: scopeHint,
      },
      {
        key: "merge_rate_weekly",
        label: "Merges / week (30d)",
        value: mergeRatePerWeek,
        status: mergeRatePerWeek > 0 ? "ok" : "watch",
        hint: hint(`${merged.totalCount} merged in 30d`),
      },
    ];

    return {
      configured: true,
      org,
      tokenExpiresAt: null,
      githubRepos,
      metrics,
      recentPullRequests: recent.pulls,
      recentRepos,
      authorWip: flow.authorWip,
      error: null,
    };
  }
}

export function createGithubDashboardService(
  settings: GithubSettingsService = createGithubSettingsService(),
) {
  return new GithubDashboardService(settings);
}

export type { GithubOrgRepoSummary, GithubPullSummary };
