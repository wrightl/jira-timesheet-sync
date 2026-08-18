import { getDb, type Db } from "@/db";
import { decryptSecret, encryptSecret, maskToken } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";
import {
  createGithubApiClient,
  inspectGithubAuthentication,
  type GithubApiClient,
  type GithubAuthInspection,
} from "@/clients/github-http";
import {
  parseGithubReposJson,
  reposMatchingOrg,
  serializeGithubRepos,
} from "@/lib/github-search-scope";
import { UserSettingsRepository } from "@/repositories/user-settings-repository";

export type GithubSettingsStatus = {
  hasToken: boolean;
  maskedToken: string | null;
  githubOrg: string | null;
  tokenExpiresAt: string | null;
  githubRepos: string[];
  configured: boolean;
};

function nonEmpty(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function expiresAtIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export type InspectGithubAuth = (options: {
  token: string;
}) => Promise<GithubAuthInspection>;

export class GithubSettingsService {
  constructor(
    private readonly settings: UserSettingsRepository,
    private readonly inspectAuth: InspectGithubAuth = inspectGithubAuthentication,
  ) {}

  async getCredentials(userId: string): Promise<{
    token: string | null;
    org: string | null;
  }> {
    const encryptionKey = getEnv().SETTINGS_ENCRYPTION_KEY;
    let row: Awaited<ReturnType<UserSettingsRepository["getByUserId"]>> = null;
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
    let tokenExpiresAt: string | null = null;
    let githubRepos: string[] = [];

    try {
      const row = await this.settings.getByUserId(userId);
      org = nonEmpty(row?.githubOrg);
      tokenExpiresAt = expiresAtIso(row?.githubTokenExpiresAt ?? null);
      githubRepos = reposMatchingOrg(
        org,
        parseGithubReposJson(row?.githubReposJson),
      );
      if (row?.githubTokenEncrypted && encryptionKey) {
        stored = decryptSecret(row.githubTokenEncrypted, encryptionKey);
      }
    } catch {
      stored = null;
      org = null;
      tokenExpiresAt = null;
      githubRepos = [];
    }

    return {
      hasToken: Boolean(stored),
      maskedToken: stored ? maskToken(stored) : null,
      githubOrg: org,
      tokenExpiresAt,
      githubRepos,
      configured: Boolean(stored && org),
    };
  }

  async saveSettings(
    userId: string,
    input: { token?: string; org?: string; repos?: string[] },
  ): Promise<GithubSettingsStatus> {
    const encryptionKey = getEnv().SETTINGS_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("SETTINGS_ENCRYPTION_KEY is not configured");
    }

    const existing = await this.settings.getByUserId(userId);

    let encryptedToken: string | null | undefined = undefined;
    let githubTokenExpiresAt: Date | null | undefined = undefined;
    let resetReminders = false;
    if (input.token !== undefined) {
      const trimmed = input.token.trim();
      if (trimmed.length > 0) {
        encryptedToken = encryptSecret(trimmed, encryptionKey);
        resetReminders = true;
        githubTokenExpiresAt = await this.probeExpiry(trimmed, userId);
      } else {
        encryptedToken = existing?.githubTokenEncrypted ?? null;
      }
    }

    const nextOrg =
      input.org !== undefined ? nonEmpty(input.org) : nonEmpty(existing?.githubOrg);
    let githubReposJson: string | null | undefined = undefined;
    if (input.repos !== undefined || input.org !== undefined) {
      const source =
        input.repos !== undefined
          ? input.repos
          : parseGithubReposJson(existing?.githubReposJson);
      githubReposJson = serializeGithubRepos(reposMatchingOrg(nextOrg, source));
    }

    const updated = await this.settings.upsertForUser(userId, {
      githubTokenEncrypted: encryptedToken,
      githubOrg: input.org !== undefined ? nonEmpty(input.org) : undefined,
      githubTokenExpiresAt,
      githubExpiryReminder14dSentAt: resetReminders ? null : undefined,
      githubExpiryReminder3dSentAt: resetReminders ? null : undefined,
      githubReposJson,
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
      tokenExpiresAt: expiresAtIso(updated.githubTokenExpiresAt),
      githubRepos: reposMatchingOrg(
        org,
        parseGithubReposJson(updated.githubReposJson),
      ),
      configured: Boolean(maskedToken && org),
    };
  }

  private async probeExpiry(
    token: string,
    userId: string,
  ): Promise<Date | null> {
    try {
      const inspection = await this.inspectAuth({ token });
      if (!inspection.ok) {
        log.warn("github-settings", "GitHub token inspection failed", {
          userId,
          status: inspection.status,
        });
        return null;
      }
      return inspection.expiresAt;
    } catch (err) {
      log.warn("github-settings", "GitHub token inspection threw", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
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
  return new GithubSettingsService(new UserSettingsRepository(db));
}
