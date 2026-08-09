/**
 * Build a Jira Cloud browse URL for an issue key.
 * Accepts a site origin (with or without trailing slash).
 */
export function jiraIssueBrowseUrl(
  baseUrl: string | null | undefined,
  issueKey: string | null | undefined,
): string | null {
  const key = issueKey?.trim();
  const base = baseUrl?.trim().replace(/\/$/, "");
  if (!key || !base) return null;
  if (/\/rest\/api\/\d+/i.test(base)) return null;
  return `${base}/browse/${encodeURIComponent(key)}`;
}
