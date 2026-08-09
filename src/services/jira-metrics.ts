import { createHash } from "node:crypto";
import type { JiraApiClient, JiraIssue } from "@/clients/jira-http";
import { extractJiraSpaceKeyFromBudgetJql } from "@/lib/jira-budget-jql";
import { getEnv } from "@/lib/env";
import {
  createApiCacheService,
  jiraSearchCacheKey,
  JIRA_SEARCH_CACHE_TTL_MS,
  type ApiCacheService,
} from "@/services/api-cache";

const DASHBOARD_FIELDS: string[] = [
  "summary",
  "issuetype",
  "status",
  "priority",
  "resolution",
  "created",
  "updated",
  "timeoriginalestimate",
  "timeestimate",
  "timespent",
];

export type JiraIssueAggregates = {
  scopedJql: string;
  issueCount: number;
  openIssueCount: number;
  estimatedOpenCount: number;
  estimateCoveragePct: number | null;
  remainingEstimateHours: number;
  originalEstimateHoursOpen: number;
  overageCount: number;
  overageHours: number;
  overageRatePct: number | null;
  openBugs: Array<{
    key: string;
    summary: string | null;
    priority: string | null;
    created: string | null;
    ageDays: number | null;
  }>;
  openBugCount: number;
  bugsCreatedInWindow: number;
  storiesCompletedInWindow: number;
  defectInjectionRatio: number | null;
  agingWipCount: number;
  agingWipOldest: {
    key: string;
    summary: string | null;
    ageDays: number | null;
  } | null;
  issues: JiraIssue[];
};

function secondsToHours(seconds: number | null | undefined): number {
  if (seconds == null || !Number.isFinite(seconds)) return 0;
  return seconds / 3600;
}

function isDone(issue: JiraIssue): boolean {
  const category = issue.fields.status?.statusCategory?.key?.toLowerCase();
  if (category === "done") return true;
  const name = issue.fields.status?.name?.toLowerCase() ?? "";
  return name === "done" || name === "won't fix" || name === "cancelled";
}

function isBug(issue: JiraIssue): boolean {
  const type = issue.fields.issuetype?.name?.toLowerCase() ?? "";
  return type.includes("bug");
}

function isStoryLike(issue: JiraIssue): boolean {
  const type = issue.fields.issuetype?.name?.toLowerCase() ?? "";
  return (
    type.includes("story") ||
    type.includes("task") ||
    type.includes("feature") ||
    type === "epic"
  );
}

function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / (24 * 60 * 60 * 1000)));
}

function withinDays(
  iso: string | null | undefined,
  now: Date,
  windowDays: number,
): boolean {
  const age = daysSince(iso, now);
  return age != null && age <= windowDays;
}

export function composeScopedJql(
  baseJql: string | null | undefined,
  extra?: string,
): string | null {
  const base = baseJql?.trim();
  if (!base) return null;
  if (!extra?.trim()) return base;
  return `(${base}) AND (${extra.trim()})`;
}

export function resolveProjectScopeJql(input: {
  jiraBudgetJql?: string | null;
  projectKeyHint?: string | null;
}): string | null {
  const fromBudget = input.jiraBudgetJql?.trim();
  if (fromBudget) return fromBudget;

  const key =
    extractJiraSpaceKeyFromBudgetJql(input.jiraBudgetJql) ??
    input.projectKeyHint?.trim().toUpperCase();
  if (!key) return null;
  return `project = ${key}`;
}

function hasOriginalEstimate(
  issue: JiraIssue,
  storyPointsField?: string | null,
): boolean {
  if (
    issue.fields.timeoriginalestimate != null &&
    issue.fields.timeoriginalestimate > 0
  ) {
    return true;
  }
  if (storyPointsField) {
    const value = issue.fields[storyPointsField];
    if (typeof value === "number" && value > 0) return true;
  }
  return false;
}

export function aggregateJiraIssues(
  issues: JiraIssue[],
  options?: { scopedJql?: string; storyPointsField?: string | null; now?: Date },
): JiraIssueAggregates {
  const now = options?.now ?? new Date();
  const storyPointsField = options?.storyPointsField;
  const open = issues.filter((i) => !isDone(i));
  const estimatedOpen = open.filter((i) =>
    hasOriginalEstimate(i, storyPointsField),
  );

  let remainingEstimateHours = 0;
  let originalEstimateHoursOpen = 0;
  let overageCount = 0;
  let overageHours = 0;

  for (const issue of issues) {
    const original = secondsToHours(issue.fields.timeoriginalestimate);
    const spent = secondsToHours(issue.fields.timespent);
    const remaining = secondsToHours(issue.fields.timeestimate);

    if (!isDone(issue)) {
      remainingEstimateHours += remaining;
      originalEstimateHoursOpen += original;
    }

    if (original > 0 && spent > original) {
      overageCount += 1;
      overageHours += spent - original;
    }
  }

  const openBugs = open
    .filter(isBug)
    .map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary ?? null,
      priority: issue.fields.priority?.name ?? null,
      created: issue.fields.created ?? null,
      ageDays: daysSince(issue.fields.created, now),
    }))
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));

  const windowDays = 30;
  const bugsCreatedInWindow = issues.filter(
    (i) => isBug(i) && withinDays(i.fields.created, now, windowDays),
  ).length;
  const storiesCompletedInWindow = issues.filter(
    (i) =>
      isStoryLike(i) &&
      isDone(i) &&
      withinDays(i.fields.updated, now, windowDays),
  ).length;

  const estimateCoveragePct =
    open.length > 0
      ? Math.round((estimatedOpen.length / open.length) * 1000) / 10
      : null;
  const overageRatePct =
    issues.length > 0
      ? Math.round((overageCount / issues.length) * 1000) / 10
      : null;
  const defectInjectionRatio =
    storiesCompletedInWindow > 0
      ? Math.round(
          (bugsCreatedInWindow / storiesCompletedInWindow) * 1000,
        ) / 1000
      : bugsCreatedInWindow > 0
        ? null
        : 0;

  const agingThresholdDays = 14;
  const agingWip = open
    .map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary ?? null,
      ageDays: daysSince(issue.fields.updated, now),
    }))
    .filter(
      (row) => row.ageDays != null && row.ageDays >= agingThresholdDays,
    )
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  const agingWipOldest = agingWip[0] ?? null;

  return {
    scopedJql: options?.scopedJql ?? "",
    issueCount: issues.length,
    openIssueCount: open.length,
    estimatedOpenCount: estimatedOpen.length,
    estimateCoveragePct,
    remainingEstimateHours:
      Math.round(remainingEstimateHours * 100) / 100,
    originalEstimateHoursOpen:
      Math.round(originalEstimateHoursOpen * 100) / 100,
    overageCount,
    overageHours: Math.round(overageHours * 100) / 100,
    overageRatePct,
    openBugs,
    openBugCount: openBugs.length,
    bugsCreatedInWindow,
    storiesCompletedInWindow,
    defectInjectionRatio,
    agingWipCount: agingWip.length,
    agingWipOldest,
    issues,
  };
}

export class JiraMetricsService {
  constructor(
    private readonly cache: ApiCacheService = createApiCacheService(),
  ) {}

  async loadScopedIssues(
    client: JiraApiClient,
    jql: string,
    baseUrl: string,
  ): Promise<JiraIssue[]> {
    const env = getEnv();
    const storyPointsField = env.JIRA_STORY_POINTS_FIELD;
    const fields = [...DASHBOARD_FIELDS];
    if (storyPointsField) fields.push(storyPointsField);

    const fieldsKey = createHash("sha256")
      .update(fields.join(","))
      .digest("hex")
      .slice(0, 12);
    const cacheKey = jiraSearchCacheKey(baseUrl, jql, fieldsKey);

    const cached = await this.cache.getCachedJson<JiraIssue[]>(cacheKey);
    if (cached) return cached;

    const issues = await client.searchAllIssues({
      jql,
      fields,
      maxResults: 100,
      maxPages: 20,
    });

    await this.cache.setCachedJson({
      cacheKey,
      resourceType: "jira_search",
      requestMeta: { baseUrl, jql, fields },
      responseBody: issues,
      ttlMs: JIRA_SEARCH_CACHE_TTL_MS,
    });

    return issues;
  }

  async computeForProject(
    client: JiraApiClient,
    input: {
      baseUrl: string;
      jiraBudgetJql?: string | null;
      projectKeyHint?: string | null;
    },
  ): Promise<JiraIssueAggregates | null> {
    const scopedJql = resolveProjectScopeJql(input);
    if (!scopedJql) return null;

    const issues = await this.loadScopedIssues(
      client,
      scopedJql,
      input.baseUrl,
    );
    return aggregateJiraIssues(issues, {
      scopedJql,
      storyPointsField: getEnv().JIRA_STORY_POINTS_FIELD,
    });
  }
}

export function createJiraMetricsService(cache?: ApiCacheService) {
  return new JiraMetricsService(cache ?? createApiCacheService());
}
