import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { encryptSecret } from "@/lib/crypto";
import { resetEnvCache } from "@/lib/env";
import { UserSettingsService } from "@/services/user-settings-service";
import type { UserSettingsRepository } from "@/repositories/user-settings-repository";

describe("UserSettingsService", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetEnvCache();
    process.env.SETTINGS_ENCRYPTION_KEY = "test-encryption-key-32chars!!";
  });

  afterEach(() => {
    process.env = { ...prev };
    resetEnvCache();
  });

  it("includes syncEnabled with GitHub status", async () => {
    const encrypted = encryptSecret(
      "ghp_test",
      process.env.SETTINGS_ENCRYPTION_KEY!,
    );
    let stored = {
      githubTokenEncrypted: encrypted,
      githubOrg: "acme",
      githubTokenExpiresAt: null as Date | null,
      githubExpiryReminder14dSentAt: null as Date | null,
      githubExpiryReminder3dSentAt: null as Date | null,
      githubReposJson: null as string | null,
      syncEnabled: true,
    };
    const settings: Pick<
      UserSettingsRepository,
      "getByUserId" | "upsertForUser"
    > = {
      getByUserId: async () => stored,
      upsertForUser: async (_id, data) => {
        stored = {
          ...stored,
          syncEnabled:
            data.syncEnabled !== undefined
              ? data.syncEnabled
              : stored.syncEnabled,
        };
        return stored;
      },
    };
    const service = new UserSettingsService(
      settings as UserSettingsRepository,
    );
    await expect(service.getStatus("user-1")).resolves.toMatchObject({
      configured: true,
      githubOrg: "acme",
      syncEnabled: true,
    });

    const saved = await service.saveSettings("user-1", { syncEnabled: false });
    expect(saved.syncEnabled).toBe(false);
  });
});
