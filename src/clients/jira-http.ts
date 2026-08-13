import { safeHttpsOrigin } from "@/lib/outbound-urls";

export interface JiraStatusCategory {
  key?: string | null;
  name?: string | null;
}

export interface JiraIssueFields {
  summary?: string | null;
  issuetype?: { name?: string | null } | null;
  status?: {
    name?: string | null;
    statusCategory?: JiraStatusCategory | null;
  } | null;
  priority?: { name?: string | null } | null;
  resolution?: { name?: string | null } | null;
  created?: string | null;
  updated?: string | null;
  timeoriginalestimate?: number | null;
  timeestimate?: number | null;
  timespent?: number | null;
  [customField: string]: unknown;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: JiraIssueFields;
}

export interface JiraSearchResult {
  issues: JiraIssue[];
  nextPageToken?: string | null;
  isLast?: boolean;
}

export interface JiraField {
  id: string;
  name: string;
  key?: string;
  custom?: boolean;
}

export interface JiraMyself {
  accountId: string;
  displayName?: string;
  emailAddress?: string;
}

export interface JiraSearchParams {
  jql: string;
  fields?: string[];
  maxResults?: number;
  nextPageToken?: string;
}

export interface JiraApiClient {
  searchIssues(params: JiraSearchParams): Promise<JiraSearchResult>;
  searchAllIssues(
    params: Omit<JiraSearchParams, "nextPageToken"> & { maxPages?: number },
  ): Promise<JiraIssue[]>;
  listFields(): Promise<JiraField[]>;
  getMyself(): Promise<JiraMyself>;
}

export class JiraHttpError extends Error {
  readonly status: number;
  readonly bodySnippet: string;
  readonly retryAfterSeconds: number | null;

  constructor(
    status: number,
    bodySnippet: string,
    path: string,
    retryAfterSeconds: number | null = null,
  ) {
    super(`Jira API ${path} failed (${status}): ${bodySnippet}`);
    this.name = "JiraHttpError";
    this.status = status;
    this.bodySnippet = bodySnippet;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const API_PREFIX = "/rest/api/3";
const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_MAX_PAGES = 20;

function normaliseBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (/\/rest\/api\/\d+/i.test(trimmed)) {
    throw new Error(
      "JIRA base URL must not include an API version path; use the site origin only",
    );
  }
  const origin = safeHttpsOrigin(trimmed);
  if (!origin) {
    throw new Error(
      "JIRA base URL must be a public https origin without credentials",
    );
  }
  return origin;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  return null;
}

export type JiraFetch = typeof fetch;

export class JiraHttpClient implements JiraApiClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly fetchImpl: JiraFetch;

  constructor(options: {
    baseUrl: string;
    email: string;
    apiToken: string;
    fetchImpl?: JiraFetch;
  }) {
    this.baseUrl = normaliseBaseUrl(options.baseUrl);
    const token = Buffer.from(
      `${options.email}:${options.apiToken}`,
      "utf8",
    ).toString("base64");
    this.authHeader = `Basic ${token}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options?: { body?: unknown },
  ): Promise<T> {
    const url = `${this.baseUrl}${API_PREFIX}${path}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: this.authHeader,
    };
    if (options?.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await this.fetchImpl(url, {
      method,
      headers,
      body:
        options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    if (!res.ok) {
      const snippet = text.slice(0, 300) || res.statusText;
      throw new JiraHttpError(
        res.status,
        snippet,
        path,
        parseRetryAfter(res.headers.get("Retry-After")),
      );
    }

    return (json ?? {}) as T;
  }

  async searchIssues(params: JiraSearchParams): Promise<JiraSearchResult> {
    const body: Record<string, unknown> = {
      jql: params.jql,
      maxResults: params.maxResults ?? DEFAULT_MAX_RESULTS,
      fields: params.fields ?? [
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
      ],
    };
    if (params.nextPageToken) {
      body.nextPageToken = params.nextPageToken;
    }

    const payload = await this.request<Record<string, unknown>>(
      "POST",
      "/search/jql",
      { body },
    );

    const issues = Array.isArray(payload.issues)
      ? (payload.issues as JiraIssue[])
      : [];
    const nextPageToken =
      typeof payload.nextPageToken === "string" ? payload.nextPageToken : null;
    const isLast =
      typeof payload.isLast === "boolean"
        ? payload.isLast
        : !nextPageToken;

    return { issues, nextPageToken, isLast };
  }

  async searchAllIssues(
    params: Omit<JiraSearchParams, "nextPageToken"> & { maxPages?: number },
  ): Promise<JiraIssue[]> {
    const maxPages = params.maxPages ?? DEFAULT_MAX_PAGES;
    const all: JiraIssue[] = [];
    let nextPageToken: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const result = await this.searchIssues({
        jql: params.jql,
        fields: params.fields,
        maxResults: params.maxResults,
        nextPageToken,
      });
      all.push(...result.issues);
      if (result.isLast || !result.nextPageToken) break;
      nextPageToken = result.nextPageToken;
    }
    return all;
  }

  async listFields(): Promise<JiraField[]> {
    const payload = await this.request<unknown>("GET", "/field");
    if (!Array.isArray(payload)) return [];
    const fields: JiraField[] = [];
    for (const item of payload) {
      const row = asRecord(item);
      if (!row || typeof row.id !== "string") continue;
      fields.push({
        id: row.id,
        name: typeof row.name === "string" ? row.name : row.id,
        key: typeof row.key === "string" ? row.key : undefined,
        custom: typeof row.custom === "boolean" ? row.custom : undefined,
      });
    }
    return fields;
  }

  async getMyself(): Promise<JiraMyself> {
    const payload = await this.request<Record<string, unknown>>("GET", "/myself");
    const accountId =
      typeof payload.accountId === "string" ? payload.accountId : "";
    return {
      accountId,
      displayName:
        typeof payload.displayName === "string" ? payload.displayName : undefined,
      emailAddress:
        typeof payload.emailAddress === "string"
          ? payload.emailAddress
          : undefined,
    };
  }
}

export function createJiraApiClient(options: {
  baseUrl: string;
  email: string;
  apiToken: string;
  fetchImpl?: JiraFetch;
}): JiraApiClient {
  return new JiraHttpClient(options);
}
