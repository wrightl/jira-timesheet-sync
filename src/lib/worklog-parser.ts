export type WorklogEventType =
  | "worklog_created"
  | "worklog_updated"
  | "worklog_deleted";

export interface ParsedWorklogEvent {
  eventType: WorklogEventType;
  worklogId: string;
  issueId: string | null;
  issueKey: string | null;
  spaceId: string | null;
  spaceKey: string | null;
  authorAccountId: string | null;
  authorDisplayName: string | null;
  timeSpentSeconds: number | null;
  started: string | null;
  comment: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractComment(worklog: Record<string, unknown>): string | null {
  const comment = worklog.comment;
  if (typeof comment === "string") {
    return comment;
  }
  const commentObj = asRecord(comment);
  if (!commentObj) {
    return null;
  }
  // ADF-style comment — flatten text nodes roughly
  const content = commentObj.content;
  if (!Array.isArray(content)) {
    return null;
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
  return texts.length > 0 ? texts.join(" ") : null;
}

const WORKLOG_EVENTS = new Set<WorklogEventType>([
  "worklog_created",
  "worklog_updated",
  "worklog_deleted",
]);

/**
 * Parse a Jira Cloud worklog webhook payload into a normalised event.
 */
export function parseWorklogWebhookPayload(
  payload: unknown,
): ParsedWorklogEvent | null {
  const root = asRecord(payload);
  if (!root) {
    return null;
  }

  const webhookEvent = asString(root.webhookEvent);
  if (!webhookEvent || !WORKLOG_EVENTS.has(webhookEvent as WorklogEventType)) {
    return null;
  }
  const eventType = webhookEvent as WorklogEventType;

  const worklog = asRecord(root.worklog);
  if (!worklog) {
    return null;
  }

  const worklogId =
    asString(worklog.id) ??
    (typeof worklog.id === "number" ? String(worklog.id) : null);
  if (!worklogId) {
    return null;
  }

  const issue = asRecord(root.issue);
  const fields = issue ? asRecord(issue.fields) : null;
  const project = fields ? asRecord(fields.project) : null;

  // Some payloads put project on the issue root or nested differently
  const projectAlt =
    project ??
    (issue ? asRecord(issue.project) : null) ??
    asRecord(worklog.project);

  const author = asRecord(worklog.author) ?? asRecord(worklog.updateAuthor);

  return {
    eventType,
    worklogId,
    issueId:
      asString(worklog.issueId) ??
      asString(issue?.id) ??
      (typeof issue?.id === "number" ? String(issue.id) : null),
    issueKey: asString(issue?.key) ?? asString(worklog.issueKey),
    spaceId:
      asString(projectAlt?.id) ??
      (typeof projectAlt?.id === "number" ? String(projectAlt.id) : null),
    spaceKey: asString(projectAlt?.key),
    authorAccountId: asString(author?.accountId),
    authorDisplayName: asString(author?.displayName),
    timeSpentSeconds: asNumber(worklog.timeSpentSeconds),
    started: asString(worklog.started),
    comment: extractComment(worklog),
  };
}
