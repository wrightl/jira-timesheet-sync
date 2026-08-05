import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { settings } from "@/db/schema";

export type SettingsRow = typeof settings.$inferSelect;

export class SettingsRepository {
  constructor(private readonly db: Db) {}

  async getDefault(): Promise<SettingsRow | null> {
    const rows = await this.db
      .select()
      .from(settings)
      .where(eq(settings.id, "default"))
      .limit(1);
    return rows[0] ?? null;
  }

  async upsertEncryptedToken(encrypted: string): Promise<void> {
    const now = new Date();
    await this.db
      .insert(settings)
      .values({
        id: "default",
        internalPmAccessTokenEncrypted: encrypted,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: settings.id,
        set: {
          internalPmAccessTokenEncrypted: encrypted,
          updatedAt: now,
        },
      });
  }
}
