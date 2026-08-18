import { describe, expect, it, vi } from "vitest";
import { createJiraApiClient, JiraHttpError } from "@/clients/jira-http";

describe("JiraHttpClient", () => {
  it("rejects base URLs that include an API version path", () => {
    expect(() =>
      createJiraApiClient({
        baseUrl: "https://example.atlassian.net/rest/api/3",
        email: "a@b.com",
        apiToken: "token",
      }),
    ).toThrow(/must not include an API version/);
  });

  it("rejects http and credentialed base URLs", () => {
    expect(() =>
      createJiraApiClient({
        baseUrl: "http://example.atlassian.net",
        email: "a@b.com",
        apiToken: "token",
      }),
    ).toThrow(/public https origin/);
    expect(() =>
      createJiraApiClient({
        baseUrl: "https://user:pass@example.atlassian.net",
        email: "a@b.com",
        apiToken: "token",
      }),
    ).toThrow(/public https origin/);
  });

  it("calls v3 search/jql", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://example.atlassian.net/rest/api/3/search/jql",
      );
      return new Response(
        JSON.stringify({
          issues: [{ id: "1", key: "ABC-1", fields: {} }],
          isLast: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = createJiraApiClient({
      baseUrl: "https://example.atlassian.net",
      email: "a@b.com",
      apiToken: "token",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const result = await client.searchIssues({
      jql: "project = ABC",
      expand: "changelog",
    });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.key).toBe("ABC-1");
    const body = JSON.parse(
      String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(body.expand).toBe("changelog");
  });

  it("fetches the last changelog page for the latest history entry", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("startAt=0")) {
        return new Response(JSON.stringify({ total: 3, values: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      expect(url).toContain("/issue/ABC-1/changelog");
      expect(url).toContain("startAt=2");
      return new Response(
        JSON.stringify({
          total: 3,
          values: [
            {
              created: "2026-08-14T09:00:00.000Z",
              items: [{ field: "status", toString: "In Progress" }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = createJiraApiClient({
      baseUrl: "https://example.atlassian.net",
      email: "a@b.com",
      apiToken: "token",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const latest = await client.getLatestChangelogEntry("ABC-1");
    expect(latest?.created).toBe("2026-08-14T09:00:00.000Z");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("paginates the full issue changelog", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("startAt=0")) {
        return new Response(
          JSON.stringify({
            total: 2,
            values: [{ created: "2026-08-10T10:00:00.000Z", items: [] }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      expect(url).toContain("startAt=1");
      return new Response(
        JSON.stringify({
          total: 2,
          values: [{ created: "2026-08-14T09:00:00.000Z", items: [] }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = createJiraApiClient({
      baseUrl: "https://example.atlassian.net",
      email: "a@b.com",
      apiToken: "token",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const entries = await client.getIssueChangelog("ABC-1");
    expect(entries).toHaveLength(2);
    expect(entries[1]?.created).toBe("2026-08-14T09:00:00.000Z");
  });

  it("fetches the newest comment", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://example.atlassian.net/rest/api/3/issue/ABC-1/comment?maxResults=1&orderBy=-created",
      );
      return new Response(
        JSON.stringify({
          total: 4,
          comments: [
            {
              created: "2026-08-14T09:00:00.000Z",
              author: { displayName: "Ada" },
              body: "Latest note",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = createJiraApiClient({
      baseUrl: "https://example.atlassian.net",
      email: "a@b.com",
      apiToken: "token",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const comment = await client.getLatestComment("ABC-1");
    expect(comment?.created).toBe("2026-08-14T09:00:00.000Z");
    expect(comment?.body).toBe("Latest note");
  });

  it("surfaces HTTP errors", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response("nope", {
        status: 401,
        headers: { "Content-Type": "text/plain" },
      });
    });

    const client = createJiraApiClient({
      baseUrl: "https://example.atlassian.net",
      email: "a@b.com",
      apiToken: "token",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.getMyself()).rejects.toBeInstanceOf(JiraHttpError);
  });
});
