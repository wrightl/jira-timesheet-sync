import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { encryptSecret } from "@/lib/crypto";
import { resetEnvCache } from "@/lib/env";
import { GithubSettingsService } from "@/services/github-settings-service";
import type { UserGithubSettingsRepository } from "@/repositories/user-github-settings-repository";

describe("GithubSettingsService", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetEnvCache();
    delete process.env.SETTINGS_ENCRYPTION_KEY;
  });

  afterEach(() => {
    process.env = { ...prev };
    resetEnvCache();
  });

  it("returns decrypted credentials when present", async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "test-encryption-key-32chars!!";
    const plain = "ghp_test_token";
    const encrypted = encryptSecret(
      plain,
      process.env.SETTINGS_ENCRYPTION_KEY,
    );
    const settings: Pick<UserGithubSettingsRepository, "getByUserId"> = {
      getByUserId: async () => ({
        githubTokenEncrypted: encrypted,
        githubOrg: "acme",
      }),
    };
    const service = new GithubSettingsService(
      settings as UserGithubSettingsRepository,
    );
    await expect(service.getCredentials("user-1")).resolves.toEqual({
      token: plain,
      org: "acme",
    });
    await expect(service.getStatus("user-1")).resolves.toMatchObject({
      hasToken: true,
      githubOrg: "acme",
      configured: true,
    });
  });

  it("reports unconfigured when token or org missing", async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "test-encryption-key-32chars!!";
    const settings: Pick<UserGithubSettingsRepository, "getByUserId"> = {
      getByUserId: async () => ({
        githubTokenEncrypted: null,
        githubOrg: "acme",
      }),
    };
    const service = new GithubSettingsService(
      settings as UserGithubSettingsRepository,
    );
    await expect(service.getStatus("user-1")).resolves.toMatchObject({
      configured: false,
      hasToken: false,
      githubOrg: "acme",
    });
  });

  it("saves org and token", async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "test-encryption-key-32chars!!";
    let stored: {
      githubTokenEncrypted: string | null;
      githubOrg: string | null;
    } = {
      githubTokenEncrypted: null,
      githubOrg: null,
    };
    const settings: Pick<
      UserGithubSettingsRepository,
      "getByUserId" | "upsertForUser"
    > = {
      getByUserId: async () => stored,
      upsertForUser: async (_id, data) => {
        stored = {
          githubTokenEncrypted:
            data.githubTokenEncrypted !== undefined
              ? data.githubTokenEncrypted
              : stored.githubTokenEncrypted,
          githubOrg:
            data.githubOrg !== undefined ? data.githubOrg : stored.githubOrg,
        };
        return stored;
      },
    };
    const service = new GithubSettingsService(
      settings as UserGithubSettingsRepository,
    );
    const status = await service.saveSettings("user-1", {
      token: "ghp_new",
      org: "dotanddash",
    });
    expect(status.configured).toBe(true);
    expect(status.githubOrg).toBe("dotanddash");
    expect(status.hasToken).toBe(true);
    expect(stored.githubTokenEncrypted).toBeTruthy();
  });
});
