import { getDb, type Db } from "@/db";
import { SettingsRepository } from "@/repositories/settings-repository";
import { createBitmapApiClient, type BitmapApiClient } from "@/clients/bitmap-http";
import {
  createJiraApiClient,
  type JiraApiClient,
} from "@/clients/jira-http";
import { decryptSecret, encryptSecret, maskToken } from "@/lib/crypto";
import { parseAlertThresholds, type AlertThresholds } from "@/lib/alert-thresholds";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { safeHttpsOrigin } from "@/lib/outbound-urls";

export type TokenSource = "database" | "env" | "none";

export type JiraCredentials = {
  /** Settings/env origin used for the Jira API. Never a Bitmap-supplied host. */
  baseUrl: string | null;
  /** Browse-link origin: validated Bitmap override, else the API base URL. */
  browseBaseUrl: string | null;
  email: string | null;
  apiToken: string | null;
  tokenSource: TokenSource;
  baseUrlSource: TokenSource | "project";
  emailSource: TokenSource;
};

export type SettingsStatus = {
  hasToken: boolean;
  tokenSource: TokenSource;
  maskedToken: string | null;
  internalPmBaseUrl: string | null;
  hasJiraToken: boolean;
  jiraTokenSource: TokenSource;
  maskedJiraToken: string | null;
  jiraBaseUrl: string | null;
  jiraEmail: string | null;
  hasSlackBotToken: boolean;
  slackBotTokenSource: TokenSource;
  maskedSlackBotToken: string | null;
  supportDeskSpaceKey: string | null;
};

function nonEmpty(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class SettingsService {
  constructor(private readonly settings: SettingsRepository) {}

  /**
   * Resolve Bitmap access token: DB encrypted value first, then env bootstrap fallback.
   * Once a token is saved in Settings, DB is the source of truth.
   */
  async getAccessToken(): Promise<string | null> {
    const env = getEnv();
    const encryptionKey = env.SETTINGS_ENCRYPTION_KEY;
    try {
      const row = await this.settings.getDefault();
      const encrypted = row?.internalPmAccessTokenEncrypted;
      if (encrypted && encryptionKey) {
        return decryptSecret(encrypted, encryptionKey);
      }
    } catch (err) {
      log.warn("settings", "Failed to read token from settings", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return env.INTERNAL_PM_ACCESS_TOKEN ?? null;
  }

  async isTokenConfigured(): Promise<boolean> {
    const token = await this.getAccessToken();
    return Boolean(token);
  }

  async getAlertThresholds(): Promise<AlertThresholds> {
    try {
      const row = await this.settings.getDefault();
      return parseAlertThresholds(row?.alertThresholdsJson);
    } catch {
      return parseAlertThresholds(null);
    }
  }

  async getJiraCredentials(
    baseUrlOverride?: string | null,
  ): Promise<JiraCredentials> {
    const env = getEnv();
    const encryptionKey = env.SETTINGS_ENCRYPTION_KEY;
    let row: Awaited<ReturnType<SettingsRepository["getDefault"]>> = null;
    try {
      row = await this.settings.getDefault();
    } catch (err) {
      log.warn("settings", "Failed to read Jira settings", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    let dbToken: string | null = null;
    if (row?.jiraApiTokenEncrypted && encryptionKey) {
      try {
        dbToken = decryptSecret(row.jiraApiTokenEncrypted, encryptionKey);
      } catch (err) {
        log.warn("settings", "Failed to decrypt Jira API token", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const dbEmail = nonEmpty(row?.jiraEmail);
    const dbBaseUrl = nonEmpty(row?.jiraBaseUrl);
    const envEmail = nonEmpty(env.JIRA_EMAIL);
    const envBaseUrl = nonEmpty(env.JIRA_BASE_URL);
    const envToken = nonEmpty(env.JIRA_API_TOKEN);
    const overrideOrigin = safeHttpsOrigin(baseUrlOverride);

    const email = dbEmail ?? envEmail;
    const emailSource: TokenSource = dbEmail
      ? "database"
      : envEmail
        ? "env"
        : "none";

    const apiToken = dbToken ?? envToken;
    const tokenSource: TokenSource = dbToken
      ? "database"
      : envToken
        ? "env"
        : "none";

    // API credentials are only ever sent to settings/env. Bitmap jira_instance_url
    // may be used as a browse-link origin after https validation.
    const baseUrl = dbBaseUrl ?? envBaseUrl;
    const baseUrlSource: TokenSource | "project" = dbBaseUrl
      ? "database"
      : envBaseUrl
        ? "env"
        : "none";
    const browseBaseUrl = overrideOrigin ?? safeHttpsOrigin(baseUrl);

    return {
      baseUrl,
      browseBaseUrl,
      email,
      apiToken,
      tokenSource,
      baseUrlSource,
      emailSource,
    };
  }

  async isJiraConfigured(): Promise<boolean> {
    const creds = await this.getJiraCredentials();
    return Boolean(
      creds.email && creds.apiToken && safeHttpsOrigin(creds.baseUrl),
    );
  }

  async getStatus(): Promise<SettingsStatus> {
    const env = getEnv();
    let stored: string | null = null;
    let jiraStored: string | null = null;
    let slackBotStored: string | null = null;
    let jiraBaseUrl: string | null = null;
    let jiraEmail: string | null = null;
    let supportDeskSpaceKey: string | null = null;
    const encryptionKey = env.SETTINGS_ENCRYPTION_KEY;
    if (encryptionKey) {
      try {
        const row = await this.settings.getDefault();
        const encrypted = row?.internalPmAccessTokenEncrypted;
        if (encrypted) {
          stored = decryptSecret(encrypted, encryptionKey);
        }
        if (row?.jiraApiTokenEncrypted) {
          jiraStored = decryptSecret(row.jiraApiTokenEncrypted, encryptionKey);
        }
        if (row?.slackBotTokenEncrypted) {
          slackBotStored = decryptSecret(row.slackBotTokenEncrypted, encryptionKey);
        }
        jiraBaseUrl = nonEmpty(row?.jiraBaseUrl) ?? nonEmpty(env.JIRA_BASE_URL);
        jiraEmail = nonEmpty(row?.jiraEmail) ?? nonEmpty(env.JIRA_EMAIL);
        supportDeskSpaceKey = nonEmpty(row?.supportDeskSpaceKey);
      } catch {
        stored = null;
        jiraStored = null;
        slackBotStored = null;
      }
    } else {
      jiraBaseUrl = nonEmpty(env.JIRA_BASE_URL);
      jiraEmail = nonEmpty(env.JIRA_EMAIL);
    }

    const envFallback = Boolean(env.INTERNAL_PM_ACCESS_TOKEN);
    const jiraEnvFallback = Boolean(env.JIRA_API_TOKEN);

    return {
      hasToken: Boolean(stored) || envFallback,
      tokenSource: stored ? "database" : envFallback ? "env" : "none",
      maskedToken: stored
        ? maskToken(stored)
        : envFallback
          ? maskToken(env.INTERNAL_PM_ACCESS_TOKEN!)
          : null,
      internalPmBaseUrl: env.INTERNAL_PM_BASE_URL ?? null,
      hasJiraToken: Boolean(jiraStored) || jiraEnvFallback,
      jiraTokenSource: jiraStored
        ? "database"
        : jiraEnvFallback
          ? "env"
          : "none",
      maskedJiraToken: jiraStored
        ? maskToken(jiraStored)
        : jiraEnvFallback
          ? maskToken(env.JIRA_API_TOKEN!)
          : null,
      jiraBaseUrl,
      jiraEmail,
      hasSlackBotToken: Boolean(slackBotStored),
      slackBotTokenSource: slackBotStored ? "database" : "none",
      maskedSlackBotToken: slackBotStored ? maskToken(slackBotStored) : null,
      supportDeskSpaceKey,
    };
  }

  async saveAccessToken(token: string): Promise<{ maskedToken: string }> {
    const encryptionKey = getEnv().SETTINGS_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("SETTINGS_ENCRYPTION_KEY is not configured");
    }
    const encrypted = encryptSecret(token, encryptionKey);
    await this.settings.upsertEncryptedToken(encrypted);
    return { maskedToken: maskToken(token) };
  }

  async saveJiraCredentials(input: {
    baseUrl?: string;
    email?: string;
    apiToken?: string;
  }): Promise<{ maskedJiraToken: string | null }> {
    const encryptionKey = getEnv().SETTINGS_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("SETTINGS_ENCRYPTION_KEY is not configured");
    }

    const existing = await this.settings.getDefault();
    let encryptedToken: string | null | undefined = undefined;
    let masked: string | null = null;

    if (input.apiToken !== undefined) {
      const trimmed = input.apiToken.trim();
      if (trimmed.length > 0) {
        encryptedToken = encryptSecret(trimmed, encryptionKey);
        masked = maskToken(trimmed);
      } else {
        encryptedToken = existing?.jiraApiTokenEncrypted ?? null;
        if (encryptedToken) {
          try {
            masked = maskToken(decryptSecret(encryptedToken, encryptionKey));
          } catch {
            masked = null;
          }
        }
      }
    }

    await this.settings.upsertJiraSettings({
      jiraBaseUrl:
        input.baseUrl !== undefined ? nonEmpty(input.baseUrl) : undefined,
      jiraEmail: input.email !== undefined ? nonEmpty(input.email) : undefined,
      jiraApiTokenEncrypted: encryptedToken,
    });

    if (masked === null && existing?.jiraApiTokenEncrypted) {
      try {
        masked = maskToken(
          decryptSecret(existing.jiraApiTokenEncrypted, encryptionKey),
        );
      } catch {
        masked = null;
      }
    }

    return { maskedJiraToken: masked };
  }

  async createConfiguredBitmapClient(): Promise<BitmapApiClient> {
    const token = (await this.getAccessToken()) ?? "";
    const env = getEnv();
    return createBitmapApiClient({
      accessToken: token,
      baseUrl: env.INTERNAL_PM_BASE_URL,
    });
  }

  async createConfiguredJiraClient(): Promise<JiraApiClient | null> {
    const creds = await this.getJiraCredentials();
    if (!creds.baseUrl || !creds.email || !creds.apiToken) {
      return null;
    }
    if (!safeHttpsOrigin(creds.baseUrl)) {
      return null;
    }
    if (/\/rest\/api\/\d+/i.test(creds.baseUrl)) {
      return null;
    }
    return createJiraApiClient({
      baseUrl: creds.baseUrl,
      email: creds.email,
      apiToken: creds.apiToken,
    });
  }

  async getSupportDeskSpaceKey(): Promise<string | null> {
    try {
      const row = await this.settings.getDefault();
      return nonEmpty(row?.supportDeskSpaceKey);
    } catch (err) {
      log.warn("settings", "Failed to read support desk space key", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async getSlackBotToken(): Promise<string | null> {
    const encryptionKey = getEnv().SETTINGS_ENCRYPTION_KEY;
    if (!encryptionKey) return null;
    
    try {
      const row = await this.settings.getDefault();
      const encrypted = row?.slackBotTokenEncrypted;
      if (!encrypted) return null;
      return decryptSecret(encrypted, encryptionKey);
    } catch (err) {
      log.warn("settings", "Failed to read Slack bot token", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async saveSupportSettings(input: {
    slackBotToken?: string;
    supportDeskSpaceKey?: string;
  }): Promise<{ maskedSlackBotToken: string | null }> {
    const encryptionKey = getEnv().SETTINGS_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("SETTINGS_ENCRYPTION_KEY is not configured");
    }

    const existing = await this.settings.getDefault();
    let encryptedToken: string | null | undefined = undefined;
    let masked: string | null = null;

    if (input.slackBotToken !== undefined) {
      const trimmed = input.slackBotToken.trim();
      if (trimmed.length > 0) {
        encryptedToken = encryptSecret(trimmed, encryptionKey);
        masked = maskToken(trimmed);
      } else {
        encryptedToken = existing?.slackBotTokenEncrypted ?? null;
        if (encryptedToken) {
          try {
            masked = maskToken(decryptSecret(encryptedToken, encryptionKey));
          } catch {
            masked = null;
          }
        }
      }
    }

    await this.settings.upsertSupportSettings({
      slackBotTokenEncrypted: encryptedToken,
      supportDeskSpaceKey: input.supportDeskSpaceKey !== undefined ? nonEmpty(input.supportDeskSpaceKey) : undefined,
    });

    if (masked === null && existing?.slackBotTokenEncrypted) {
      try {
        masked = maskToken(
          decryptSecret(existing.slackBotTokenEncrypted, encryptionKey),
        );
      } catch {
        masked = null;
      }
    }

    return { maskedSlackBotToken: masked };
  }
}

export function createSettingsService(db: Db = getDb()) {
  return new SettingsService(new SettingsRepository(db));
}
