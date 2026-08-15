import { getDb, type Db } from "@/db";
import {
  inspectGithubAuthentication,
  type GithubAuthInspection,
} from "@/clients/github-http";
import {
  createSlackBotClient,
  type SlackBotClient,
} from "@/clients/slack-bot";
import { decryptSecret } from "@/lib/crypto";
import {
  isEmailDigestConfigured,
  sendAlertEmailDigest,
} from "@/lib/email-digest";
import { getEnv } from "@/lib/env";
import {
  githubExpiryReminderCopy,
  githubExpiryReminderWindow,
  utcDaysRemaining,
  type GithubExpiryReminderWindow,
} from "@/lib/github-token-expiry";
import { log } from "@/lib/log";
import {
  UserSettingsRepository,
  type GithubTokenUserRow,
} from "@/repositories/user-settings-repository";
import {
  createSettingsService,
  type SettingsService,
} from "@/services/settings-service";

export type GithubTokenExpiryReminderRunResult = {
  checked: number;
  sent: number;
  skipped: number;
  errors: number;
};

type InspectGithubAuth = (options: {
  token: string;
}) => Promise<GithubAuthInspection>;

type SendEmail = (input: {
  to: string;
  subject: string;
  digestText: string;
}) => Promise<void>;

function settingsUrl(): string {
  const base = (getEnv().APP_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${base}/settings`;
}

function alreadySent(
  row: GithubTokenUserRow,
  window: GithubExpiryReminderWindow,
): boolean {
  if (window === "14d") return Boolean(row.githubExpiryReminder14dSentAt);
  return Boolean(row.githubExpiryReminder3dSentAt);
}

export class GithubTokenExpiryReminderService {
  constructor(
    private readonly settings: UserSettingsRepository,
    private readonly appSettings: SettingsService,
    private readonly inspectAuth: InspectGithubAuth = inspectGithubAuthentication,
    private readonly sendEmail: SendEmail = sendAlertEmailDigest,
    private readonly createSlack: (options: {
      botToken: string;
    }) => SlackBotClient = createSlackBotClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(): Promise<GithubTokenExpiryReminderRunResult> {
    const encryptionKey = getEnv().SETTINGS_ENCRYPTION_KEY;
    const result: GithubTokenExpiryReminderRunResult = {
      checked: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
    };
    if (!encryptionKey) {
      log.warn("github-token-expiry", "SETTINGS_ENCRYPTION_KEY is not configured");
      return result;
    }

    const users = await this.settings.listGithubTokenUsers();
    const slackBotToken = await this.appSettings.getSlackBotToken();
    const slack = slackBotToken
      ? this.createSlack({ botToken: slackBotToken })
      : null;
    const emailEnabled = isEmailDigestConfigured();
    const now = this.now();

    for (const row of users) {
      result.checked += 1;
      let expiresAt = row.githubTokenExpiresAt;
      if (!expiresAt) {
        const probed = await this.backfillExpiry(row, encryptionKey);
        expiresAt = probed;
      }
      if (!expiresAt) {
        result.skipped += 1;
        continue;
      }

      const daysRemaining = utcDaysRemaining(expiresAt, now);
      const window = githubExpiryReminderWindow(daysRemaining);
      if (!window) {
        result.skipped += 1;
        continue;
      }
      if (alreadySent(row, window)) {
        result.skipped += 1;
        continue;
      }

      const delivered = await this.deliver({
        row,
        window,
        daysRemaining,
        expiresAt,
        slack,
        emailEnabled,
      });
      if (delivered) {
        await this.settings.markGithubExpiryReminderSent(
          row.userId,
          window,
          now,
        );
        result.sent += 1;
      } else {
        result.errors += 1;
      }
    }

    return result;
  }

  private async backfillExpiry(
    row: GithubTokenUserRow,
    encryptionKey: string,
  ): Promise<Date | null> {
    let token: string;
    try {
      token = decryptSecret(row.githubTokenEncrypted, encryptionKey);
    } catch (err) {
      log.warn("github-token-expiry", "Failed to decrypt GitHub token", {
        userId: row.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }

    try {
      const inspection = await this.inspectAuth({ token });
      if (!inspection.ok) {
        log.warn("github-token-expiry", "GitHub token inspection failed", {
          userId: row.userId,
          status: inspection.status,
        });
        return null;
      }
      await this.settings.upsertForUser(row.userId, {
        githubTokenExpiresAt: inspection.expiresAt,
      });
      return inspection.expiresAt;
    } catch (err) {
      log.warn("github-token-expiry", "GitHub token inspection threw", {
        userId: row.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async deliver(input: {
    row: GithubTokenUserRow;
    window: GithubExpiryReminderWindow;
    daysRemaining: number;
    expiresAt: Date;
    slack: SlackBotClient | null;
    emailEnabled: boolean;
  }): Promise<boolean> {
    const copy = githubExpiryReminderCopy({
      window: input.window,
      daysRemaining: input.daysRemaining,
      expiresAt: input.expiresAt,
      settingsUrl: settingsUrl(),
    });

    let slackOk = false;
    let emailOk = false;

    if (input.slack) {
      try {
        const slackUser = await input.slack.findUserByEmail(input.row.email);
        if (!slackUser) {
          log.warn("github-token-expiry", "No Slack user for email", {
            userId: input.row.userId,
            email: input.row.email,
          });
        } else {
          await input.slack.sendDirectMessage(slackUser.id, copy.body);
          slackOk = true;
        }
      } catch (err) {
        log.error("github-token-expiry", "Slack DM failed", {
          userId: input.row.userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (input.emailEnabled) {
      try {
        await this.sendEmail({
          to: input.row.email,
          subject: copy.subject,
          digestText: copy.body,
        });
        emailOk = true;
      } catch (err) {
        log.error("github-token-expiry", "Expiry reminder email failed", {
          userId: input.row.userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return slackOk || emailOk;
  }
}

export function createGithubTokenExpiryReminderService(db: Db = getDb()) {
  return new GithubTokenExpiryReminderService(
    new UserSettingsRepository(db),
    createSettingsService(db),
  );
}
