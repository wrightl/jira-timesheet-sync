import { getDb, type Db } from "@/db";
import { SettingsRepository } from "@/repositories/settings-repository";
import { createBitmapApiClient, type BitmapApiClient } from "@/clients/bitmap-http";
import { decryptSecret, encryptSecret, maskToken } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";

export type TokenSource = "database" | "env" | "none";

export type SettingsStatus = {
  hasToken: boolean;
  tokenSource: TokenSource;
  maskedToken: string | null;
  internalPmBaseUrl: string | null;
};

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

  async getStatus(): Promise<SettingsStatus> {
    const env = getEnv();
    let stored: string | null = null;
    const encryptionKey = env.SETTINGS_ENCRYPTION_KEY;
    if (encryptionKey) {
      try {
        const row = await this.settings.getDefault();
        const encrypted = row?.internalPmAccessTokenEncrypted;
        if (encrypted) {
          stored = decryptSecret(encrypted, encryptionKey);
        }
      } catch {
        stored = null;
      }
    }

    const envFallback = Boolean(env.INTERNAL_PM_ACCESS_TOKEN);
    return {
      hasToken: Boolean(stored) || envFallback,
      tokenSource: stored ? "database" : envFallback ? "env" : "none",
      maskedToken: stored
        ? maskToken(stored)
        : envFallback
          ? maskToken(env.INTERNAL_PM_ACCESS_TOKEN!)
          : null,
      internalPmBaseUrl: env.INTERNAL_PM_BASE_URL ?? null,
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

  async createConfiguredBitmapClient(): Promise<BitmapApiClient> {
    const token = (await this.getAccessToken()) ?? "";
    const env = getEnv();
    return createBitmapApiClient({
      accessToken: token,
      baseUrl: env.INTERNAL_PM_BASE_URL,
    });
  }
}

export function createSettingsService(db: Db = getDb()) {
  return new SettingsService(new SettingsRepository(db));
}
