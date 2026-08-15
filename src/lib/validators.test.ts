import { describe, expect, it } from "vitest";
import {
  mappingCreateSchema,
  mappingUpdateSchema,
  settingsUpdateSchema,
  githubSettingsUpdateSchema,
  userSettingsUpdateSchema,
  userMappingCreateSchema,
  userMappingUpdateSchema,
  userSpaceMappingCreateSchema,
  adminUserCreateSchema,
  adminUserUpdateSchema,
  meUpdateSchema,
} from "@/lib/validators";

describe("mappingCreateSchema", () => {
  it("accepts a valid mapping and defaults enabled", () => {
    const result = mappingCreateSchema.parse({
      jiraSpaceKey: "ENG",
      clientId: "client-1",
    });
    expect(result.enabled).toBe(true);
  });

  it("rejects missing fields", () => {
    const result = mappingCreateSchema.safeParse({
      jiraSpaceKey: "",
      clientId: "client-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects the excluded TheCurve client", () => {
    expect(
      mappingCreateSchema.safeParse({
        jiraSpaceKey: "INT",
        clientId: "5e8f8b80d9f37277a88e7f10",
      }).success,
    ).toBe(false);
  });
});

describe("mappingUpdateSchema", () => {
  it("allows partial updates", () => {
    expect(mappingUpdateSchema.parse({ enabled: false })).toEqual({
      enabled: false,
    });
  });
});

describe("userSpaceMappingCreateSchema", () => {
  it("rejects the excluded TheCurve client", () => {
    expect(
      userSpaceMappingCreateSchema.safeParse({
        jiraSpaceKey: "INT",
        clientId: "5e8f8b80d9f37277a88e7f10",
        projectId: "p1",
        projectBudgetId: "b1",
      }).success,
    ).toBe(false);
  });
});

describe("userMappingCreateSchema", () => {
  it("accepts a valid user mapping", () => {
    const result = userMappingCreateSchema.parse({
      jiraDisplayName: "Ada Lovelace",
      bitmapUserId: "bitmap-1",
    });
    expect(result.enabled).toBe(true);
    expect(result.jiraDisplayName).toBe("Ada Lovelace");
  });

  it("rejects missing bitmap user id", () => {
    expect(
      userMappingCreateSchema.safeParse({
        jiraDisplayName: "Ada",
        bitmapUserId: "",
      }).success,
    ).toBe(false);
  });
});

describe("userMappingUpdateSchema", () => {
  it("allows partial updates", () => {
    expect(userMappingUpdateSchema.parse({ jobTitle: "QA Engineer" })).toEqual({
      jobTitle: "QA Engineer",
    });
  });
});

describe("settingsUpdateSchema", () => {
  it("requires a non-empty token", () => {
    expect(settingsUpdateSchema.safeParse({ internalPmAccessToken: "" }).success).toBe(
      false,
    );
    expect(
      settingsUpdateSchema.parse({ internalPmAccessToken: "tok_abc" }),
    ).toEqual({ internalPmAccessToken: "tok_abc" });
  });

  it("accepts Atlassian Cloud and Slack webhook https URLs", () => {
    expect(
      settingsUpdateSchema.parse({
        jiraBaseUrl: "https://acme.atlassian.net",
      }).jiraBaseUrl,
    ).toBe("https://acme.atlassian.net");
    expect(
      settingsUpdateSchema.parse({
        slackWebhookUrl: "https://hooks.slack.com/services/T00/B00/xxx",
      }).slackWebhookUrl,
    ).toBe("https://hooks.slack.com/services/T00/B00/xxx");
  });

  it("allows empty URL fields so settings can be left unchanged or cleared", () => {
    expect(
      settingsUpdateSchema.parse({ jiraBaseUrl: "" }).jiraBaseUrl,
    ).toBe("");
    expect(
      settingsUpdateSchema.parse({ slackWebhookUrl: "" }).slackWebhookUrl,
    ).toBe("");
  });

  it("rejects javascript, http, private, and non-allowlisted hosts", () => {
    expect(
      settingsUpdateSchema.safeParse({ jiraBaseUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
    expect(
      settingsUpdateSchema.safeParse({
        jiraBaseUrl: "http://acme.atlassian.net",
      }).success,
    ).toBe(false);
    expect(
      settingsUpdateSchema.safeParse({
        jiraBaseUrl: "https://evil.example.com",
      }).success,
    ).toBe(false);
    expect(
      settingsUpdateSchema.safeParse({ jiraBaseUrl: "https://127.0.0.1" })
        .success,
    ).toBe(false);
    expect(
      settingsUpdateSchema.safeParse({
        slackWebhookUrl: "https://example.com/hooks",
      }).success,
    ).toBe(false);
  });
});

describe("githubSettingsUpdateSchema", () => {
  it("requires at least one field", () => {
    expect(githubSettingsUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      githubSettingsUpdateSchema.parse({ githubOrg: "acme" }),
    ).toEqual({ githubOrg: "acme" });
  });
});

describe("userSettingsUpdateSchema", () => {
  it("requires at least one field", () => {
    expect(userSettingsUpdateSchema.safeParse({}).success).toBe(false);
    expect(userSettingsUpdateSchema.parse({ syncEnabled: true })).toEqual({
      syncEnabled: true,
    });
    expect(
      userSettingsUpdateSchema.parse({ githubOrg: "acme" }),
    ).toEqual({ githubOrg: "acme" });
    expect(
      userSettingsUpdateSchema.parse({ githubRepos: ["acme/app", "acme/app"] }),
    ).toEqual({ githubRepos: ["acme/app"] });
  });

  it("rejects malformed or too many githubRepos", () => {
    expect(
      userSettingsUpdateSchema.safeParse({ githubRepos: ["not-a-repo"] })
        .success,
    ).toBe(false);
    expect(
      userSettingsUpdateSchema.safeParse({
        githubRepos: Array.from({ length: 41 }, (_, i) => `acme/r${i}`),
      }).success,
    ).toBe(false);
  });
});

describe("adminUserCreateSchema", () => {
  it("defaults role to user", () => {
    const result = adminUserCreateSchema.parse({
      email: "a@b.com",
      password: "longenough",
    });
    expect(result.role).toBe("user");
  });

  it("rejects short passwords", () => {
    expect(
      adminUserCreateSchema.safeParse({
        email: "a@b.com",
        password: "short",
      }).success,
    ).toBe(false);
  });
});

describe("adminUserUpdateSchema", () => {
  it("requires role, password, or syncEnabled", () => {
    expect(adminUserUpdateSchema.safeParse({}).success).toBe(false);
    expect(adminUserUpdateSchema.parse({ role: "admin" })).toEqual({
      role: "admin",
    });
    expect(
      adminUserUpdateSchema.parse({ password: "longenough" }),
    ).toEqual({ password: "longenough" });
    expect(adminUserUpdateSchema.parse({ syncEnabled: false })).toEqual({
      syncEnabled: false,
    });
  });
});

describe("meUpdateSchema", () => {
  it("requires syncEnabled boolean", () => {
    expect(meUpdateSchema.safeParse({}).success).toBe(false);
    expect(meUpdateSchema.parse({ syncEnabled: true })).toEqual({
      syncEnabled: true,
    });
    expect(meUpdateSchema.parse({ syncEnabled: false })).toEqual({
      syncEnabled: false,
    });
  });
});
