import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { users } from "@/db/schema";

export type UserGithubSettingsRow = {
  githubTokenEncrypted: string | null;
  githubOrg: string | null;
};

export type UserGithubSettingsUpsert = {
  githubTokenEncrypted?: string | null;
  githubOrg?: string | null;
};

export class UserGithubSettingsRepository {
  constructor(private readonly db: Db) {}

  async getByUserId(userId: string): Promise<UserGithubSettingsRow | null> {
    const rows = await this.db
      .select({
        githubTokenEncrypted: users.githubTokenEncrypted,
        githubOrg: users.githubOrg,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async upsertForUser(
    userId: string,
    data: UserGithubSettingsUpsert,
  ): Promise<UserGithubSettingsRow | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (data.githubTokenEncrypted !== undefined) {
      set.githubTokenEncrypted = data.githubTokenEncrypted;
    }
    if (data.githubOrg !== undefined) {
      set.githubOrg = data.githubOrg;
    }

    const [row] = await this.db
      .update(users)
      .set(set)
      .where(eq(users.id, userId))
      .returning({
        githubTokenEncrypted: users.githubTokenEncrypted,
        githubOrg: users.githubOrg,
      });
    return row ?? null;
  }
}
