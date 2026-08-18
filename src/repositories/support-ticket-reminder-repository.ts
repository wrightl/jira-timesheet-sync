import { and, eq, gte } from "drizzle-orm";
import type { Db } from "@/db";
import { supportTicketReminders, type NewSupportTicketReminder } from "@/db/schema";

export class SupportTicketReminderRepository {
  constructor(private readonly db: Db) {}

  async create(data: NewSupportTicketReminder): Promise<void> {
    await this.db.insert(supportTicketReminders).values(data);
  }

  async hasRecentReminder(
    jiraIssueKey: string,
    sinceDate: Date,
  ): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(supportTicketReminders)
      .where(
        and(
          eq(supportTicketReminders.jiraIssueKey, jiraIssueKey),
          gte(supportTicketReminders.reminderSentAt, sinceDate),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
