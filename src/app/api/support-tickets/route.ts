import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createSettingsService } from "@/services/settings-service";
import { SupportTicketsService } from "@/services/support-tickets-service";
import { SupportTicketReminderRepository } from "@/repositories/support-ticket-reminder-repository";
import { getDb } from "@/db";
import { SettingsRepository } from "@/repositories/settings-repository";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const db = getDb();
    const settingsService = createSettingsService(db);
    const jiraClient = await settingsService.createConfiguredJiraClient();
    
    if (!jiraClient) {
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

    const tickets = await service.getTickets();
    const metrics = service.metricsFromTickets(tickets);

    return Response.json({ tickets, metrics });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch support tickets";
    return Response.json({ error: message }, { status: 500 });
  }
}
