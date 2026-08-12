import type {
  GithubApiClient,
  GithubOrgRepoSummary,
  GithubPullSummary,
} from "@/clients/github-http";
import type {
  GithubDashboardMetric,
  GithubDashboardResult,
} from "@/lib/github-dashboard";
import {
  createGithubSettingsService,
  type GithubSettingsService,
} from "@/services/github-settings-service";

export type {
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
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async buildDashboard(
    client: GithubApiClient,
    org: string,
  ): Promise<GithubDashboardResult> {
    const [openCount, draftCount, needsReviewCount, recent, repos] =
      await Promise.all([
        client.countOpenPullRequests(org),
        client.countOpenPullRequests(org, "is:draft"),
        client.countOpenPullRequests(org, "review:required"),
        client.searchOpenPullRequests(org, { first: 20 }),
        client.listRecentlyUpdatedRepos(org, { first: 8 }),
      ]);

    const published = Math.max(openCount - draftCount, 0);

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
    ];

    return {
      configured: true,
      org,
      metrics,
      recentPullRequests: recent.pulls,
      recentRepos: repos,
      error: null,
    };
  }
}

export function createGithubDashboardService(
  settings: GithubSettingsService = createGithubSettingsService(),
) {
  return new GithubDashboardService(settings);
}

// Re-export unused type aliases for tests/callers that imported from service.
export type { GithubOrgRepoSummary, GithubPullSummary };
