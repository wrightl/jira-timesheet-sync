import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { encryptSecret } from "@/lib/crypto";
import { resetEnvCache } from "@/lib/env";
import { GithubSettingsService } from "@/services/github-settings-service";
import type { UserSettingsRepository } from "@/repositories/user-settings-repository";

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
    const settings: Pick<UserSettingsRepository, "getByUserId"> = {
      getByUserId: async () => ({
        githubTokenEncrypted: encrypted,
        githubOrg: "acme",
        githubTokenExpiresAt: new Date("2026-09-01T00:00:00.000Z"),
        githubExpiryReminder14dSentAt: null,
        githubExpiryReminder3dSentAt: null,
        githubReposJson: '["acme/app"]',
        syncEnabled: false,
      }),
    };
    const service = new GithubSettingsService(
      settings as UserSettingsRepository,
    );
    await expect(service.getCredentials("user-1")).resolves.toEqual({
      token: plain,
      org: "acme",
    });
    await expect(service.getStatus("user-1")).resolves.toMatchObject({
      hasToken: true,
      githubOrg: "acme",
      configured: true,
      tokenExpiresAt: "2026-09-01T00:00:00.000Z",
      githubRepos: ["acme/app"],
    });
  });

  it("reports unconfigured when token or org missing", async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "test-encryption-key-32chars!!";
    const settings: Pick<UserSettingsRepository, "getByUserId"> = {
      getByUserId: async () => ({
        githubTokenEncrypted: null,
        githubOrg: "acme",
        githubTokenExpiresAt: null,
        githubExpiryReminder14dSentAt: null,
        githubExpiryReminder3dSentAt: null,
        githubReposJson: null,
        syncEnabled: false,
      }),
    };
    const service = new GithubSettingsService(
      settings as UserSettingsRepository,
    );
    await expect(service.getStatus("user-1")).resolves.toMatchObject({
      configured: false,
      hasToken: false,
      githubOrg: "acme",
    });
  });

  it("saves org and token and stores probed expiry", async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "test-encryption-key-32chars!!";
    const expiresAt = new Date("2026-09-01T00:00:00.000Z");
    let stored: {
      githubTokenEncrypted: string | null;
      githubOrg: string | null;
      githubTokenExpiresAt: Date | null;
      githubExpiryReminder14dSentAt: Date | null;
      githubExpiryReminder3dSentAt: Date | null;
      githubReposJson: string | null;
      syncEnabled: boolean;
    } = {
      githubTokenEncrypted: encryptSecret(
        "ghp_old",
        process.env.SETTINGS_ENCRYPTION_KEY,
      ),
      githubOrg: "old-org",
      githubTokenExpiresAt: new Date("2026-08-01T00:00:00.000Z"),
      githubExpiryReminder14dSentAt: new Date("2026-07-01T00:00:00.000Z"),
      githubExpiryReminder3dSentAt: new Date("2026-07-15T00:00:00.000Z"),
      githubReposJson: '["old-org/legacy","acme/keep"]',
      syncEnabled: false,
    };
    const settings: Pick<
      UserSettingsRepository,
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
          githubTokenExpiresAt:
            data.githubTokenExpiresAt !== undefined
              ? data.githubTokenExpiresAt
              : stored.githubTokenExpiresAt,
          githubExpiryReminder14dSentAt:
            data.githubExpiryReminder14dSentAt !== undefined
              ? data.githubExpiryReminder14dSentAt
              : stored.githubExpiryReminder14dSentAt,
          githubExpiryReminder3dSentAt:
            data.githubExpiryReminder3dSentAt !== undefined
              ? data.githubExpiryReminder3dSentAt
              : stored.githubExpiryReminder3dSentAt,
          githubReposJson:
            data.githubReposJson !== undefined
              ? data.githubReposJson
              : stored.githubReposJson,
          syncEnabled:
            data.syncEnabled !== undefined
              ? data.syncEnabled
              : stored.syncEnabled,
        };
        return stored;
      },
    };
    const inspectAuth = async () => ({
      ok: true,
      status: 200,
      expiresAt,
    });
    const service = new GithubSettingsService(
      settings as UserSettingsRepository,
      inspectAuth,
    );
    const status = await service.saveSettings("user-1", {
      token: "ghp_new",
      org: "dotanddash",
    });
    expect(status.configured).toBe(true);
    expect(status.githubOrg).toBe("dotanddash");
    expect(status.hasToken).toBe(true);
    expect(status.tokenExpiresAt).toBe(expiresAt.toISOString());
    expect(stored.githubTokenEncrypted).toBeTruthy();
    expect(stored.githubTokenExpiresAt).toEqual(expiresAt);
    expect(stored.githubExpiryReminder14dSentAt).toBeNull();
    expect(stored.githubExpiryReminder3dSentAt).toBeNull();
    expect(stored.githubReposJson).toBeNull();
    expect(status.githubRepos).toEqual([]);
  });

  it("strips selected repos that do not match the new org", async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "test-encryption-key-32chars!!";
    let stored: {
      githubTokenEncrypted: string | null;
      githubOrg: string | null;
      githubTokenExpiresAt: Date | null;
      githubExpiryReminder14dSentAt: Date | null;
      githubExpiryReminder3dSentAt: Date | null;
      githubReposJson: string | null;
      syncEnabled: boolean;
    } = {
      githubTokenEncrypted: encryptSecret(
        "ghp_old",
        process.env.SETTINGS_ENCRYPTION_KEY,
      ),
      githubOrg: "old-org",
      githubTokenExpiresAt: null,
      githubExpiryReminder14dSentAt: null,
      githubExpiryReminder3dSentAt: null,
      githubReposJson: '["old-org/legacy","acme/app"]',
      syncEnabled: false,
    };
    const settings: Pick<
      UserSettingsRepository,
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
          githubTokenExpiresAt:
            data.githubTokenExpiresAt !== undefined
              ? data.githubTokenExpiresAt
              : stored.githubTokenExpiresAt,
          githubExpiryReminder14dSentAt:
            data.githubExpiryReminder14dSentAt !== undefined
              ? data.githubExpiryReminder14dSentAt
              : stored.githubExpiryReminder14dSentAt,
          githubExpiryReminder3dSentAt:
            data.githubExpiryReminder3dSentAt !== undefined
              ? data.githubExpiryReminder3dSentAt
              : stored.githubExpiryReminder3dSentAt,
          githubReposJson:
            data.githubReposJson !== undefined
              ? data.githubReposJson
              : stored.githubReposJson,
          syncEnabled:
            data.syncEnabled !== undefined
              ? data.syncEnabled
              : stored.syncEnabled,
        };
        return stored;
      },
    };
    const service = new GithubSettingsService(
      settings as UserSettingsRepository,
      async () => ({ ok: true, status: 200, expiresAt: null }),
    );
    const status = await service.saveSettings("user-1", { org: "acme" });
    expect(status.githubOrg).toBe("acme");
    expect(status.githubRepos).toEqual(["acme/app"]);
    expect(stored.githubReposJson).toBe('["acme/app"]');
  });
});
