import { eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { userSettings, users } from "@/db/schema";

export type UserSettingsRow = {
  githubTokenEncrypted: string | null;
  githubOrg: string | null;
  githubTokenExpiresAt: Date | null;
  githubExpiryReminder14dSentAt: Date | null;
  githubExpiryReminder3dSentAt: Date | null;
  githubReposJson: string | null;
  syncEnabled: boolean;
};

export type UserSettingsUpsert = {
  githubTokenEncrypted?: string | null;
  githubOrg?: string | null;
  githubTokenExpiresAt?: Date | null;
  githubExpiryReminder14dSentAt?: Date | null;
  githubExpiryReminder3dSentAt?: Date | null;
  githubReposJson?: string | null;
  syncEnabled?: boolean;
};

export type GithubTokenUserRow = {
  userId: string;
  email: string;
  githubTokenEncrypted: string;
  githubTokenExpiresAt: Date | null;
  githubExpiryReminder14dSentAt: Date | null;
  githubExpiryReminder3dSentAt: Date | null;
};

const returningColumns = {
  githubTokenEncrypted: userSettings.githubTokenEncrypted,
  githubOrg: userSettings.githubOrg,
  githubTokenExpiresAt: userSettings.githubTokenExpiresAt,
  githubExpiryReminder14dSentAt: userSettings.githubExpiryReminder14dSentAt,
  githubExpiryReminder3dSentAt: userSettings.githubExpiryReminder3dSentAt,
  githubReposJson: userSettings.githubReposJson,
  syncEnabled: userSettings.syncEnabled,
};

export class UserSettingsRepository {
  constructor(private readonly db: Db) {}

  async getByUserId(userId: string): Promise<UserSettingsRow | null> {
    const rows = await this.db
      .select(returningColumns)
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async ensureForUser(userId: string): Promise<UserSettingsRow> {
    const existing = await this.getByUserId(userId);
    if (existing) return existing;

    const [row] = await this.db
      .insert(userSettings)
      .values({ userId })
      .onConflictDoNothing()
      .returning(returningColumns);

    if (row) return row;

    const created = await this.getByUserId(userId);
    if (!created) {
      throw new Error("User not found");
    }
    return created;
  }

  async listGithubTokenUsers(): Promise<GithubTokenUserRow[]> {
    const rows = await this.db
      .select({
        userId: userSettings.userId,
        email: users.email,
        githubTokenEncrypted: userSettings.githubTokenEncrypted,
        githubTokenExpiresAt: userSettings.githubTokenExpiresAt,
        githubExpiryReminder14dSentAt: userSettings.githubExpiryReminder14dSentAt,
        githubExpiryReminder3dSentAt: userSettings.githubExpiryReminder3dSentAt,
      })
      .from(userSettings)
      .innerJoin(users, eq(users.id, userSettings.userId))
      .where(isNotNull(userSettings.githubTokenEncrypted));

    return rows.filter(
      (row): row is GithubTokenUserRow => row.githubTokenEncrypted != null,
    );
  }

  async markGithubExpiryReminderSent(
    userId: string,
    window: "14d" | "3d",
    sentAt: Date,
  ): Promise<void> {
    const set =
      window === "14d"
        ? { githubExpiryReminder14dSentAt: sentAt, updatedAt: sentAt }
        : { githubExpiryReminder3dSentAt: sentAt, updatedAt: sentAt };
    await this.db
      .update(userSettings)
      .set(set)
      .where(eq(userSettings.userId, userId));
  }

  async upsertForUser(
    userId: string,
    data: UserSettingsUpsert,
  ): Promise<UserSettingsRow | null> {
    const now = new Date();
    const set: Record<string, unknown> = { updatedAt: now };
    if (data.githubTokenEncrypted !== undefined) {
      set.githubTokenEncrypted = data.githubTokenEncrypted;
    }
    if (data.githubOrg !== undefined) {
      set.githubOrg = data.githubOrg;
    }
    if (data.githubTokenExpiresAt !== undefined) {
      set.githubTokenExpiresAt = data.githubTokenExpiresAt;
    }
    if (data.githubExpiryReminder14dSentAt !== undefined) {
      set.githubExpiryReminder14dSentAt = data.githubExpiryReminder14dSentAt;
    }
    if (data.githubExpiryReminder3dSentAt !== undefined) {
      set.githubExpiryReminder3dSentAt = data.githubExpiryReminder3dSentAt;
    }
    if (data.githubReposJson !== undefined) {
      set.githubReposJson = data.githubReposJson;
    }
    if (data.syncEnabled !== undefined) {
      set.syncEnabled = data.syncEnabled;
    }

    try {
      const [row] = await this.db
        .insert(userSettings)
        .values({
          userId,
          githubTokenEncrypted: data.githubTokenEncrypted ?? null,
          githubOrg: data.githubOrg ?? null,
          githubTokenExpiresAt: data.githubTokenExpiresAt ?? null,
          githubExpiryReminder14dSentAt:
            data.githubExpiryReminder14dSentAt ?? null,
          githubExpiryReminder3dSentAt:
            data.githubExpiryReminder3dSentAt ?? null,
          githubReposJson: data.githubReposJson ?? null,
          syncEnabled: data.syncEnabled ?? false,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set,
        })
        .returning(returningColumns);
      return row ?? null;
    } catch {
      return null;
    }
  }
}
