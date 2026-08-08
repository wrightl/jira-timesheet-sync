import { describe, expect, it } from "vitest";
import { extractJiraSpaceKeyFromBudgetJql } from "@/lib/jira-budget-jql";

describe("extractJiraSpaceKeyFromBudgetJql", () => {
  it("extracts a bare project key", () => {
    expect(extractJiraSpaceKeyFromBudgetJql("project = EPCBC")).toBe("EPCBC");
  });

  it("extracts a double-quoted project key", () => {
    expect(extractJiraSpaceKeyFromBudgetJql('project = "EPCBC"')).toBe("EPCBC");
  });

  it("extracts a single-quoted project key", () => {
    expect(extractJiraSpaceKeyFromBudgetJql("project = 'EPCBC'")).toBe("EPCBC");
  });

  it("extracts from a full budget JQL with surrounding clauses", () => {
    const jql =
      'project = EPCBC AND (sprint in openSprints() or sprint in futureSprints()) AND status != "Done" AND status != "Won\'t Fix"';
    expect(extractJiraSpaceKeyFromBudgetJql(jql)).toBe("EPCBC");
  });

  it("matches a case-insensitive project keyword", () => {
    expect(extractJiraSpaceKeyFromBudgetJql("PROJECT = EPCBC")).toBe("EPCBC");
    expect(extractJiraSpaceKeyFromBudgetJql("Project = EPCBC")).toBe("EPCBC");
  });

  it("returns null for empty or missing JQL", () => {
    expect(extractJiraSpaceKeyFromBudgetJql(null)).toBeNull();
    expect(extractJiraSpaceKeyFromBudgetJql(undefined)).toBeNull();
    expect(extractJiraSpaceKeyFromBudgetJql("")).toBeNull();
    expect(extractJiraSpaceKeyFromBudgetJql("   ")).toBeNull();
  });

  it("returns null for project in (...)", () => {
    expect(
      extractJiraSpaceKeyFromBudgetJql("project in (EPCBC, OTHER)"),
    ).toBeNull();
  });

  it("returns null when project = is absent", () => {
    expect(
      extractJiraSpaceKeyFromBudgetJql("sprint in openSprints()"),
    ).toBeNull();
  });
});
