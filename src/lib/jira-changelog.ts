export type JiraChangelogItem = {
  field?: string | null;
  fromString?: string | null;
  toString?: string | null;
};

export type JiraChangelogHistory = {
  id?: string;
  created?: string | null;
  author?: { displayName?: string | null } | null;
  items?: JiraChangelogItem[] | null;
};

export type JiraChangelog = {
  startAt?: number;
  maxResults?: number;
  total?: number;
  histories?: JiraChangelogHistory[];
  values?: JiraChangelogHistory[];
};

export function changelogHistories(
  changelog: JiraChangelog | null | undefined,
): JiraChangelogHistory[] {
  if (!changelog) return [];
  if (Array.isArray(changelog.histories) && changelog.histories.length > 0) {
    return changelog.histories;
  }
  if (Array.isArray(changelog.values)) return changelog.values;
  return [];
}

export function isChangelogTruncated(
  changelog: JiraChangelog | null | undefined,
): boolean {
  if (!changelog) return false;
  const entries = changelogHistories(changelog);
  const total = changelog.total ?? entries.length;
  return total > entries.length;
}

export function latestChangelogHistory(
  changelog: JiraChangelog | null | undefined,
): JiraChangelogHistory | null {
  const entries = changelogHistories(changelog);
  if (entries.length === 0) return null;

  let latest = entries[0]!;
  let latestMs = Date.parse(latest.created ?? "") || 0;
  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i]!;
    const ms = Date.parse(entry.created ?? "") || 0;
    if (ms >= latestMs) {
      latest = entry;
      latestMs = ms;
    }
  }
  return latest;
}

export function formatChangelogActivity(history: JiraChangelogHistory): string {
  const changes = (history.items ?? [])
    .map((item) => {
      const field = item.field?.trim() || "Field";
      const from = item.fromString?.trim();
      const to = item.toString?.trim();
      if (from && to) return `${field}: ${from} → ${to}`;
      if (to) return `${field}: ${to}`;
      if (from) return `${field}: ${from}`;
      return field;
    })
    .filter(Boolean);

  const summary = changes.length > 0 ? changes.join("; ") : "Updated";
  const author = history.author?.displayName?.trim();
  return author ? `${author} — ${summary}` : summary;
}
