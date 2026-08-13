import { safeHttpsOrigin } from "@/lib/outbound-urls";

/**
 * Build a Jira Cloud browse URL for an issue key.
 * Accepts a site origin (with or without trailing slash).
 * Only https origins are returned; javascript: and private hosts are rejected.
 */
export function jiraIssueBrowseUrl(
  baseUrl: string | null | undefined,
  issueKey: string | null | undefined,
): string | null {
  const key = issueKey?.trim();
  if (!key || !baseUrl) return null;
  if (/\/rest\/api\/\d+/i.test(baseUrl)) return null;
  const origin = safeHttpsOrigin(baseUrl);
  if (!origin) return null;
  return `${origin}/browse/${encodeURIComponent(key)}`;
}
