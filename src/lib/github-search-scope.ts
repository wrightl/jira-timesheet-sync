export const GITHUB_REPO_NAME_MAX = 40;
export const GITHUB_REPO_NAME_RE = /^[^/\s]+\/[^/\s]+$/;

export function parseGithubReposJson(
  value: string | null | undefined,
): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const names: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const trimmed = item.trim();
      if (!GITHUB_REPO_NAME_RE.test(trimmed)) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(trimmed);
      if (names.length >= GITHUB_REPO_NAME_MAX) break;
    }
    return names;
  } catch {
    return [];
  }
}

export function serializeGithubRepos(repos: string[]): string | null {
  const unique = parseGithubReposJson(JSON.stringify(repos));
  return unique.length > 0 ? JSON.stringify(unique) : null;
}

export function reposMatchingOrg(
  org: string | null | undefined,
  repos: string[],
): string[] {
  const prefix = (org ?? "").trim().toLowerCase();
  if (!prefix) return [];
  const needle = `${prefix}/`;
  return repos.filter((name) => name.toLowerCase().startsWith(needle));
}

/** GitHub search qualifier: whole org, or an OR-list of selected repos. */
export function githubSearchScope(
  org: string,
  repos?: string[] | null,
): string {
  const selected = reposMatchingOrg(org, repos ?? []);
  if (selected.length === 0) {
    return `org:${org.trim()}`;
  }
  const clause = selected.map((name) => `repo:${name}`).join(" OR ");
  return `(${clause})`;
}

/**
 * One search query per selected repo (or a single org query).
 * GitHub's OR parser often ignores trailing qualifiers, so counts must
 * be summed from these rather than one combined `repo:a OR repo:b is:pr`.
 */
export function githubRepoSearchQueries(
  org: string,
  repos: string[] | null | undefined,
  extra: string,
): string[] {
  const extraPart = extra.trim();
  const selected = reposMatchingOrg(org, repos ?? []);
  if (selected.length === 0) {
    return [`org:${org.trim()} ${extraPart}`.trim()];
  }
  return selected.map((name) => `repo:${name} ${extraPart}`.trim());
}
