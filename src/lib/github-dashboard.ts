import type {
  GithubOrgRepoSummary,
  GithubPullSummary,
} from "@/clients/github-http";

export type GithubDashboardMetric = {
  key: string;
  label: string;
  value: number | null;
  status: "ok" | "watch" | "risk" | "unavailable";
  hint?: string;
};

export type GithubDashboardResult = {
  configured: boolean;
  org: string | null;
  metrics: GithubDashboardMetric[];
  recentPullRequests: GithubPullSummary[];
  recentRepos: GithubOrgRepoSummary[];
  error: string | null;
};

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
