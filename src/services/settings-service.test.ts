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
