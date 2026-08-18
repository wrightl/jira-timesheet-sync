import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { matchesBearerSecret } from "@/lib/timing-safe";
import { getEnv } from "@/lib/env";
import { createSettingsService } from "@/services/settings-service";
import { SupportTicketsService } from "@/services/support-tickets-service";
import { SupportTicketReminderRepository } from "@/repositories/support-ticket-reminder-repository";
import { getDb } from "@/db";
import { log } from "@/lib/log";

function authoriseCronOrAdmin(request: NextRequest): Promise<Response | null> {
  const secret = getEnv().CRON_SECRET;
  if (matchesBearerSecret(request.headers.get("authorization"), secret)) {
    return Promise.resolve(null);
  }
  return requireAdmin(request).then((auth) => auth.error ?? null);
}

export async function GET(request: NextRequest) {
  const denied = await authoriseCronOrAdmin(request);
  if (denied) return denied;

  try {
    const db = getDb();
    const settingsService = createSettingsService(db);
    const jiraClient = await settingsService.createConfiguredJiraClient();

    if (!jiraClient) {
      log.warn("support-ticket-reminders", "Jira credentials not configured");
      return Response.json(
        { error: "Jira credentials not configured" },
        { status: 400 },
      );
    }

    const reminderRepo = new SupportTicketReminderRepository(db);
    const service = new SupportTicketsService(
      jiraClient,
      settingsService,
      reminderRepo,
    );

    const result = await service.sendStaleTicketReminders();

    log.info("support-ticket-reminders", "Reminder run complete", result);

    return Response.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send reminders";
    log.error("support-ticket-reminders", "Reminder run failed", {
      error: message,
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
