import type {
  GithubApiClient,
  GithubOrgRepoSummary,
  GithubPullSummary,
} from "@/clients/github-http";
import type {
  GithubAuthorWip,
  GithubDashboardMetric,
  GithubDashboardResult,
} from "@/lib/github-dashboard";
import {
  createGithubSettingsService,
  type GithubSettingsService,
} from "@/services/github-settings-service";

export type {
  GithubAuthorWip,
  GithubDashboardMetric,
  GithubDashboardResult,
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
    const configured = await this.settings.createConfiguredClient(userId);
    if (!configured) {
      return {
        configured: false,
        org: null,
        metrics: [],
        recentPullRequests: [],
        recentRepos: [],
        authorWip: [],
        error: null,
      };
    }

    const { client, org } = configured;
    try {
      return await this.buildDashboard(client, org);
    } catch (err) {
      return {
        configured: true,
        org,
        metrics: [],
        recentPullRequests: [],
        recentRepos: [],
        authorWip: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async buildDashboard(
    client: GithubApiClient,
    org: string,
  ): Promise<GithubDashboardResult> {
    const staleCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const [
      openCount,
      draftCount,
      needsReviewCount,
      staleCountSearch,
      merged,
      recent,
      repos,
    ] = await Promise.all([
      client.countOpenPullRequests(org),
      client.countOpenPullRequests(org, "is:draft"),
      client.countOpenPullRequests(org, "review:required"),
      client.countOpenPullRequests(org, `updated:<${staleCutoff}`),
      client.searchMergedPullRequests(org, { first: 20, sinceDays: 30 }),
      client.searchOpenPullRequests(org, { first: 40 }),
      client.listRecentlyUpdatedRepos(org, { first: 8 }),
    ]);

    const published = Math.max(openCount - draftCount, 0);
    const flow = computeFlowMetrics(recent.pulls);
    const mergeRatePerWeek =
      Math.round((merged.totalCount / (30 / 7)) * 10) / 10;

    const metrics: GithubDashboardMetric[] = [
      {
        key: "open_prs",
        label: "Open pull requests",
        value: openCount,
        status: metricStatus(openCount, 25, 50),
        hint: `Across ${org}`,
      },
      {
        key: "draft_prs",
        label: "Draft PRs",
        value: draftCount,
        status: "ok",
      },
      {
        key: "published_prs",
        label: "Published open PRs",
        value: published,
        status: metricStatus(published, 20, 40),
      },
      {
        key: "needs_review",
        label: "PRs needing review",
        value: needsReviewCount,
        status: metricStatus(needsReviewCount, 10, 20),
        hint: "GitHub review:required",
      },
      {
        key: "stale_prs",
        label: "Stale PRs (7d+)",
        value: staleCountSearch,
        status: metricStatus(staleCountSearch, 5, 12),
        hint: "No updates in 7+ days",
      },
      {
        key: "median_open_age_h",
        label: "Median open age (h)",
        value: flow.medianOpenAgeHours,
        status:
          flow.medianOpenAgeHours == null
            ? "unavailable"
            : metricStatus(flow.medianOpenAgeHours, 48, 120),
        hint: "Sample of recent open PRs",
      },
      {
        key: "median_ttf_review_h",
        label: "Median time to first review (h)",
        value: flow.medianTimeToFirstReviewHours,
        status:
          flow.medianTimeToFirstReviewHours == null
            ? "unavailable"
            : metricStatus(flow.medianTimeToFirstReviewHours, 24, 72),
      },
      {
        key: "merge_rate_weekly",
        label: "Merges / week (30d)",
        value: mergeRatePerWeek,
        status: mergeRatePerWeek > 0 ? "ok" : "watch",
        hint: `${merged.totalCount} merged in 30d`,
      },
    ];

    return {
      configured: true,
      org,
      metrics,
      recentPullRequests: recent.pulls.slice(0, 20),
      recentRepos: repos,
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
