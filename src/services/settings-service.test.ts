import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { encryptSecret } from "@/lib/crypto";
import { resetEnvCache } from "@/lib/env";
import { SettingsService } from "@/services/settings-service";
import type { SettingsRepository } from "@/repositories/settings-repository";

describe("SettingsService.getAccessToken", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetEnvCache();
    delete process.env.INTERNAL_PM_ACCESS_TOKEN;
    delete process.env.SETTINGS_ENCRYPTION_KEY;
  });

  afterEach(() => {
    process.env = { ...prev };
    resetEnvCache();
  });

  it("returns decrypted DB token when present", async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "test-encryption-key-32chars!!";
    const plain = "db-token-value";
    const encrypted = encryptSecret(
      plain,
      process.env.SETTINGS_ENCRYPTION_KEY,
    );
    const settings: Pick<SettingsRepository, "getDefault"> = {
      getDefault: async () => ({
        id: "default",
        internalPmAccessTokenEncrypted: encrypted,
        jiraBaseUrl: null,
        jiraEmail: null,
        jiraApiTokenEncrypted: null,
        slackWebhookUrlEncrypted: null,
        alertEmail: null,
        alertThresholdsJson: null,
        updatedAt: new Date(),
      }),
    };
    const service = new SettingsService(settings as SettingsRepository);
    expect(await service.getAccessToken()).toBe(plain);
  });

  it("falls back to env when DB has no token", async () => {
    process.env.INTERNAL_PM_ACCESS_TOKEN = "env-token";
    const settings: Pick<SettingsRepository, "getDefault"> = {
      getDefault: async () => null,
    };
    const service = new SettingsService(settings as SettingsRepository);
    expect(await service.getAccessToken()).toBe("env-token");
  });
});

describe("SettingsService.getJiraCredentials", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetEnvCache();
    delete process.env.JIRA_BASE_URL;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;
    delete process.env.SETTINGS_ENCRYPTION_KEY;
  });

  afterEach(() => {
    process.env = { ...prev };
    resetEnvCache();
  });

  function serviceWith(row: {
    jiraBaseUrl?: string | null;
    jiraEmail?: string | null;
    jiraApiTokenEncrypted?: string | null;
  }) {
    const settings: Pick<SettingsRepository, "getDefault"> = {
      getDefault: async () => ({
        id: "default",
        internalPmAccessTokenEncrypted: null,
        jiraBaseUrl: row.jiraBaseUrl ?? null,
        jiraEmail: row.jiraEmail ?? null,
        jiraApiTokenEncrypted: row.jiraApiTokenEncrypted ?? null,
        slackWebhookUrlEncrypted: null,
        alertEmail: null,
        alertThresholdsJson: null,
        updatedAt: new Date(),
      }),
    };
    return new SettingsService(settings as SettingsRepository);
  }

  it("uses settings/env as the API base URL and never a Bitmap override", async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "test-encryption-key-32chars!!";
    process.env.JIRA_API_TOKEN = "env-token";
    const service = serviceWith({
      jiraBaseUrl: "https://company.atlassian.net",
      jiraEmail: "bot@example.com",
    });

    const creds = await service.getJiraCredentials(
      "https://evil.example.com",
    );
    expect(creds.baseUrl).toBe("https://company.atlassian.net");
    expect(creds.baseUrlSource).toBe("database");
    expect(creds.apiToken).toBe("env-token");
    expect(creds.browseBaseUrl).toBe("https://evil.example.com");
  });

  it("does not send credentials when only a Bitmap host is available", async () => {
    process.env.JIRA_EMAIL = "bot@example.com";
    process.env.JIRA_API_TOKEN = "env-token";
    const service = serviceWith({});

    const creds = await service.getJiraCredentials(
      "https://bitmap-supplied.atlassian.net",
    );
    expect(creds.baseUrl).toBeNull();
    expect(creds.baseUrlSource).toBe("none");
    expect(creds.browseBaseUrl).toBe("https://bitmap-supplied.atlassian.net");
    expect(creds.apiToken).toBe("env-token");
    expect(await service.isJiraConfigured()).toBe(false);
    expect(await service.createConfiguredJiraClient()).toBeNull();
  });

  it("ignores javascript and private Bitmap overrides for browse links", async () => {
    const service = serviceWith({
      jiraBaseUrl: "https://company.atlassian.net",
    });

    expect(
      (await service.getJiraCredentials("javascript:alert(1)")).browseBaseUrl,
    ).toBe("https://company.atlassian.net");
    expect(
      (await service.getJiraCredentials("https://127.0.0.1")).browseBaseUrl,
    ).toBe("https://company.atlassian.net");
    expect(
      (await service.getJiraCredentials("http://other.atlassian.net"))
        .browseBaseUrl,
    ).toBe("https://company.atlassian.net");
  });
});
