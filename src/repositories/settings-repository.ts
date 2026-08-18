import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { settings } from "@/db/schema";

export type SettingsRow = typeof settings.$inferSelect;

export type JiraSettingsUpsert = {
  jiraBaseUrl?: string | null;
  jiraEmail?: string | null;
  jiraApiTokenEncrypted?: string | null;
};

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

  async upsertJiraSettings(data: JiraSettingsUpsert): Promise<void> {
    const now = new Date();
    const set: Record<string, unknown> = { updatedAt: now };
    if (data.jiraBaseUrl !== undefined) set.jiraBaseUrl = data.jiraBaseUrl;
    if (data.jiraEmail !== undefined) set.jiraEmail = data.jiraEmail;
    if (data.jiraApiTokenEncrypted !== undefined) {
      set.jiraApiTokenEncrypted = data.jiraApiTokenEncrypted;
    }

    await this.db
      .insert(settings)
      .values({
        id: "default",
        jiraBaseUrl: data.jiraBaseUrl ?? null,
        jiraEmail: data.jiraEmail ?? null,
        jiraApiTokenEncrypted: data.jiraApiTokenEncrypted ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: settings.id,
        set,
      });
  }

  async upsertAlertSettings(data: {
    slackWebhookUrlEncrypted?: string | null;
    alertEmail?: string | null;
    alertThresholdsJson?: string | null;
  }): Promise<void> {
    const now = new Date();
    const set: Record<string, unknown> = { updatedAt: now };
    if (data.slackWebhookUrlEncrypted !== undefined) {
      set.slackWebhookUrlEncrypted = data.slackWebhookUrlEncrypted;
    }
    if (data.alertEmail !== undefined) set.alertEmail = data.alertEmail;
    if (data.alertThresholdsJson !== undefined) {
      set.alertThresholdsJson = data.alertThresholdsJson;
    }

    await this.db
      .insert(settings)
      .values({
        id: "default",
        slackWebhookUrlEncrypted: data.slackWebhookUrlEncrypted ?? null,
        alertEmail: data.alertEmail ?? null,
        alertThresholdsJson: data.alertThresholdsJson ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: settings.id,
        set,
      });
  }

  async upsertSupportSettings(data: {
    slackBotTokenEncrypted?: string | null;
    supportDeskSpaceKey?: string | null;
  }): Promise<void> {
    const now = new Date();
    const set: Record<string, unknown> = { updatedAt: now };
    if (data.slackBotTokenEncrypted !== undefined) {
      set.slackBotTokenEncrypted = data.slackBotTokenEncrypted;
    }
    if (data.supportDeskSpaceKey !== undefined) {
      set.supportDeskSpaceKey = data.supportDeskSpaceKey;
    }

    await this.db
      .insert(settings)
      .values({
        id: "default",
        slackBotTokenEncrypted: data.slackBotTokenEncrypted ?? null,
        supportDeskSpaceKey: data.supportDeskSpaceKey ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: settings.id,
        set,
      });
  }
}
