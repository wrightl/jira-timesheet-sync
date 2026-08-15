import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { encryptSecret } from "@/lib/crypto";
import { resetEnvCache } from "@/lib/env";
import { GithubTokenExpiryReminderService } from "@/services/github-token-expiry-reminder-service";
import type {
  GithubTokenUserRow,
  UserSettingsRepository,
} from "@/repositories/user-settings-repository";
import type { SettingsService } from "@/services/settings-service";

const KEY = "test-encryption-key-32chars!!";
const now = new Date("2026-08-15T12:00:00.000Z");

function tokenRow(
  overrides: Partial<GithubTokenUserRow> = {},
): GithubTokenUserRow {
  return {
    userId: "user-1",
    email: "ada@example.com",
    githubTokenEncrypted: encryptSecret("ghp_test", KEY),
    githubTokenExpiresAt: new Date("2026-08-29T12:00:00.000Z"),
    githubExpiryReminder14dSentAt: null,
    githubExpiryReminder3dSentAt: null,
    ...overrides,
  };
}

describe("GithubTokenExpiryReminderService", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetEnvCache();
    process.env.SETTINGS_ENCRYPTION_KEY = KEY;
    process.env.APP_BASE_URL = "https://app.example.com";
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "alerts@example.com";
  });

  afterEach(() => {
    process.env = { ...prev };
    resetEnvCache();
  });

  it("sends 14-day Slack and email reminders once", async () => {
    const mark = vi.fn(async () => undefined);
    const sendEmail = vi.fn(async () => undefined);
    const sendDirectMessage = vi.fn(async () => undefined);
    const settings = {
      listGithubTokenUsers: async () => [tokenRow()],
      markGithubExpiryReminderSent: mark,
      upsertForUser: vi.fn(),
    } as unknown as UserSettingsRepository;
    const appSettings = {
      getSlackBotToken: async () => "xoxb-test",
    } as unknown as SettingsService;

    const service = new GithubTokenExpiryReminderService(
      settings,
      appSettings,
      async () => ({ ok: true, status: 200, expiresAt: null }),
      sendEmail,
      () => ({
        findUserByEmail: async () => ({ id: "U1", email: "ada@example.com" }),
        sendDirectMessage,
      }),
      () => now,
    );

    const result = await service.run();
    expect(result).toMatchObject({ checked: 1, sent: 1, skipped: 0, errors: 0 });
    expect(sendDirectMessage).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(mark).toHaveBeenCalledWith("user-1", "14d", now);
  });

  it("does not send the same window twice", async () => {
    const mark = vi.fn(async () => undefined);
    const sendEmail = vi.fn(async () => undefined);
    const settings = {
      listGithubTokenUsers: async () => [
        tokenRow({ githubExpiryReminder14dSentAt: now }),
      ],
      markGithubExpiryReminderSent: mark,
      upsertForUser: vi.fn(),
    } as unknown as UserSettingsRepository;
    const appSettings = {
      getSlackBotToken: async () => "xoxb-test",
    } as unknown as SettingsService;

    const service = new GithubTokenExpiryReminderService(
      settings,
      appSettings,
      async () => ({ ok: true, status: 200, expiresAt: null }),
      sendEmail,
      () => ({
        findUserByEmail: async () => ({ id: "U1" }),
        sendDirectMessage: vi.fn(),
      }),
      () => now,
    );

    const result = await service.run();
    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
    expect(mark).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips tokens with no expiry after a successful probe", async () => {
    const mark = vi.fn(async () => undefined);
    const upsertForUser = vi.fn(async () => null);
    const settings = {
      listGithubTokenUsers: async () => [
        tokenRow({ githubTokenExpiresAt: null }),
      ],
      markGithubExpiryReminderSent: mark,
      upsertForUser,
    } as unknown as UserSettingsRepository;
    const appSettings = {
      getSlackBotToken: async () => null,
    } as unknown as SettingsService;

    const service = new GithubTokenExpiryReminderService(
      settings,
      appSettings,
      async () => ({ ok: true, status: 200, expiresAt: null }),
      vi.fn(),
      () => ({
        findUserByEmail: async () => null,
        sendDirectMessage: vi.fn(),
      }),
      () => now,
    );

    const result = await service.run();
    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
    expect(upsertForUser).toHaveBeenCalledWith("user-1", {
      githubTokenExpiresAt: null,
    });
    expect(mark).not.toHaveBeenCalled();
  });

  it("sends the 3-day reminder when remaining days are 3 or fewer", async () => {
    const mark = vi.fn(async () => undefined);
    const sendEmail = vi.fn(async () => undefined);
    const settings = {
      listGithubTokenUsers: async () => [
        tokenRow({
          githubTokenExpiresAt: new Date("2026-08-18T12:00:00.000Z"),
        }),
      ],
      markGithubExpiryReminderSent: mark,
      upsertForUser: vi.fn(),
    } as unknown as UserSettingsRepository;
    const appSettings = {
      getSlackBotToken: async () => null,
    } as unknown as SettingsService;

    const service = new GithubTokenExpiryReminderService(
      settings,
      appSettings,
      async () => ({ ok: true, status: 200, expiresAt: null }),
      sendEmail,
      () => ({
        findUserByEmail: async () => null,
        sendDirectMessage: vi.fn(),
      }),
      () => now,
    );

    const result = await service.run();
    expect(result.sent).toBe(1);
    expect(mark).toHaveBeenCalledWith("user-1", "3d", now);
  });
});
