import {
  formatChangelogActivity,
  type JiraChangelogHistory,
} from "@/lib/jira-changelog";

export type JiraComment = {
  id?: string;
  created?: string | null;
  updated?: string | null;
  author?: { displayName?: string | null } | null;
  body?: unknown;
};

export type JiraCommentPage = {
  startAt?: number;
  maxResults?: number;
  total?: number;
  comments?: JiraComment[];
};

export type JiraActivity = {
  at: string;
  summary: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function flattenAdf(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const root = asRecord(value);
  if (!root) return null;
  const content = root.content;
  if (!Array.isArray(content)) {
    return typeof root.text === "string" && root.text.trim()
      ? root.text.trim()
      : null;
  }
  const texts: string[] = [];
  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      const n = asRecord(node);
      if (!n) continue;
      if (typeof n.text === "string") texts.push(n.text);
      if (Array.isArray(n.content)) walk(n.content);
    }
  };
  walk(content);
  const joined = texts.join(" ").replace(/\s+/g, " ").trim();
  return joined.length > 0 ? joined : null;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

export function formatCommentActivity(comment: JiraComment): string {
  const preview = flattenAdf(comment.body);
  const summary = preview
    ? `Commented: ${truncate(preview, 80)}`
    : "Commented";
  const author = comment.author?.displayName?.trim();
  return author ? `${author} — ${summary}` : summary;
}

function candidate(
  at: string | null | undefined,
  summary: string,
): JiraActivity | null {
  if (!at || !Number.isFinite(Date.parse(at))) return null;
  return { at, summary };
}

export function pickLatestActivity(options: {
  history?: JiraChangelogHistory | null;
  comment?: JiraComment | null;
  created?: string | null;
}): JiraActivity | null {
  const candidates: JiraActivity[] = [];
  const history = options.history
    ? candidate(options.history.created, formatChangelogActivity(options.history))
    : null;
  const comment = options.comment
    ? candidate(
        options.comment.created ?? options.comment.updated,
        formatCommentActivity(options.comment),
      )
    : null;
  const created = candidate(options.created, "Created");
  if (history) candidates.push(history);
  if (comment) candidates.push(comment);
  if (created) candidates.push(created);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return candidates[0] ?? null;
}
