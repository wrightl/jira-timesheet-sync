import { getDb, type Db } from "@/db";
import {
  createGithubApiClient,
  type GithubApiClient,
} from "@/clients/github-http";
import { decryptSecret, encryptSecret, maskToken } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { UserGithubSettingsRepository } from "@/repositories/user-github-settings-repository";

export type GithubSettingsStatus = {
  hasToken: boolean;
  maskedToken: string | null;
  githubOrg: string | null;
  configured: boolean;
};

function nonEmpty(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class GithubSettingsService {
  constructor(private readonly settings: UserGithubSettingsRepository) {}

  async getCredentials(userId: string): Promise<{
    token: string | null;
    org: string | null;
  }> {
    const encryptionKey = getEnv().SETTINGS_ENCRYPTION_KEY;
    let row: Awaited<
      ReturnType<UserGithubSettingsRepository["getByUserId"]>
    > = null;
    try {
      row = await this.settings.getByUserId(userId);
    } catch (err) {
      log.warn("github-settings", "Failed to read user GitHub settings", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { token: null, org: null };
    }

    let token: string | null = null;
    if (row?.githubTokenEncrypted && encryptionKey) {
      try {
        token = decryptSecret(row.githubTokenEncrypted, encryptionKey);
      } catch (err) {
        log.warn("github-settings", "Failed to decrypt GitHub token", {
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      token,
      org: nonEmpty(row?.githubOrg),
    };
  }

  async getStatus(userId: string): Promise<GithubSettingsStatus> {
    const encryptionKey = getEnv().SETTINGS_ENCRYPTION_KEY;
    let stored: string | null = null;
    let org: string | null = null;

    try {
      const row = await this.settings.getByUserId(userId);
      org = nonEmpty(row?.githubOrg);
      if (row?.githubTokenEncrypted && encryptionKey) {
        stored = decryptSecret(row.githubTokenEncrypted, encryptionKey);
      }
    } catch {
      stored = null;
      org = null;
    }

    return {
      hasToken: Boolean(stored),
      maskedToken: stored ? maskToken(stored) : null,
      githubOrg: org,
      configured: Boolean(stored && org),
    };
  }

  async saveSettings(
    userId: string,
    input: { token?: string; org?: string },
  ): Promise<GithubSettingsStatus> {
    const encryptionKey = getEnv().SETTINGS_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("SETTINGS_ENCRYPTION_KEY is not configured");
    }

    const existing = await this.settings.getByUserId(userId);
    if (!existing) {
      throw new Error("User not found");
    }

    let encryptedToken: string | null | undefined = undefined;
    if (input.token !== undefined) {
      const trimmed = input.token.trim();
      if (trimmed.length > 0) {
        encryptedToken = encryptSecret(trimmed, encryptionKey);
      } else {
        encryptedToken = existing.githubTokenEncrypted;
      }
    }

    const updated = await this.settings.upsertForUser(userId, {
      githubTokenEncrypted: encryptedToken,
      githubOrg:
        input.org !== undefined ? nonEmpty(input.org) : undefined,
    });

    if (!updated) {
      throw new Error("User not found");
    }

    let maskedToken: string | null = null;
    if (updated.githubTokenEncrypted) {
      try {
        maskedToken = maskToken(
          decryptSecret(updated.githubTokenEncrypted, encryptionKey),
        );
      } catch {
        maskedToken = null;
      }
    }

    const org = nonEmpty(updated.githubOrg);
    return {
      hasToken: Boolean(maskedToken),
      maskedToken,
      githubOrg: org,
      configured: Boolean(maskedToken && org),
    };
  }

  async createConfiguredClient(
    userId: string,
  ): Promise<{ client: GithubApiClient; org: string } | null> {
    const creds = await this.getCredentials(userId);
    if (!creds.token || !creds.org) return null;
    return {
      client: createGithubApiClient({ token: creds.token }),
      org: creds.org,
    };
  }
}

export function createGithubSettingsService(db: Db = getDb()) {
  return new GithubSettingsService(new UserGithubSettingsRepository(db));
}
