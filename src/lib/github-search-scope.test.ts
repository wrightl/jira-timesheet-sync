import { describe, expect, it } from "vitest";
import {
  githubRepoSearchQueries,
  githubSearchScope,
  parseGithubReposJson,
  reposMatchingOrg,
  serializeGithubRepos,
} from "@/lib/github-search-scope";

describe("githubSearchScope", () => {
  it("uses org scope when no repos are selected", () => {
    expect(githubSearchScope("acme")).toBe("org:acme");
    expect(githubSearchScope("acme", [])).toBe("org:acme");
  });

  it("ORs selected repositories", () => {
    expect(githubSearchScope("acme", ["acme/app", "acme/api"])).toBe(
      "(repo:acme/app OR repo:acme/api)",
    );
  });

  it("ignores repos from another org", () => {
    expect(githubSearchScope("acme", ["other/app", "acme/api"])).toBe(
      "(repo:acme/api)",
    );
  });
});

describe("githubRepoSearchQueries", () => {
  it("returns a single org query when nothing is selected", () => {
    expect(githubRepoSearchQueries("acme", [], "is:pr is:open")).toEqual([
      "org:acme is:pr is:open",
    ]);
  });

  it("returns one query per selected repo", () => {
    expect(
      githubRepoSearchQueries("acme", ["acme/app", "acme/api"], "is:pr is:open"),
    ).toEqual([
      "repo:acme/app is:pr is:open",
      "repo:acme/api is:pr is:open",
    ]);
  });
});

describe("parseGithubReposJson", () => {
  it("returns unique valid names", () => {
    expect(
      parseGithubReposJson('["acme/app","acme/app","bad","acme/api"]'),
    ).toEqual(["acme/app", "acme/api"]);
  });

  it("serializes empty as null", () => {
    expect(serializeGithubRepos([])).toBeNull();
    expect(serializeGithubRepos(["acme/app"])).toBe('["acme/app"]');
  });
});

describe("reposMatchingOrg", () => {
  it("filters by org prefix case-insensitively", () => {
    expect(
      reposMatchingOrg("Acme", ["acme/app", "other/x", "ACME/api"]),
    ).toEqual(["acme/app", "ACME/api"]);
  });
});
