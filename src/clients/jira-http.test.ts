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

    const result = await client.searchIssues({ jql: "project = ABC" });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.key).toBe("ABC-1");
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
