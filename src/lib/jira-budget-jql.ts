/**
 * Extract a Jira project/space key from Bitmap `jira_budget_jql`.
 *
 * Only the common form is supported:
 *   project = KEY
 *   project = "KEY"
 *   project = 'KEY'
 *
 * Returns null for empty JQL, `project in (...)`, or any other shape.
 */
const PROJECT_EQ_KEY =
  /\bproject\s*=\s*(?:"([A-Z][A-Z0-9_]*)"|'([A-Z][A-Z0-9_]*)'|([A-Z][A-Z0-9_]*))/i;

export function extractJiraSpaceKeyFromBudgetJql(
  jql: string | null | undefined,
): string | null {
  if (!jql?.trim()) return null;

  const match = PROJECT_EQ_KEY.exec(jql);
  if (!match) return null;

  const key = match[1] ?? match[2] ?? match[3];
  return key ? key.toUpperCase() : null;
}
