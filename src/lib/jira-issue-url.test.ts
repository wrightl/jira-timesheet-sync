import { describe, expect, it } from "vitest";
import { jiraIssueBrowseUrl } from "@/lib/jira-issue-url";

describe("jiraIssueBrowseUrl", () => {
  it("builds a browse URL from site origin and issue key", () => {
    expect(
      jiraIssueBrowseUrl("https://example.atlassian.net", "ENG-42"),
    ).toBe("https://example.atlassian.net/browse/ENG-42");
  });

  it("strips trailing slash from the base URL", () => {
    expect(
      jiraIssueBrowseUrl("https://example.atlassian.net/", "ENG-42"),
    ).toBe("https://example.atlassian.net/browse/ENG-42");
  });

  it("returns null when base or key is missing", () => {
    expect(jiraIssueBrowseUrl(null, "ENG-42")).toBeNull();
    expect(jiraIssueBrowseUrl("https://example.atlassian.net", null)).toBeNull();
    expect(jiraIssueBrowseUrl("", "ENG-42")).toBeNull();
  });

  it("rejects base URLs that include an API path", () => {
    expect(
      jiraIssueBrowseUrl(
        "https://example.atlassian.net/rest/api/3",
        "ENG-42",
      ),
    ).toBeNull();
  });
});
