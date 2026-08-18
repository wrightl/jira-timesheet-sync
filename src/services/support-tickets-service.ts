import { getDb, type Db } from "@/db";
import type { JiraApiClient, JiraIssue } from "@/clients/jira-http";
import { createSlackBotClient } from "@/clients/slack-bot";
import { SettingsService } from "@/services/settings-service";
import { SupportTicketReminderRepository } from "@/repositories/support-ticket-reminder-repository";
import { log } from "@/lib/log";
import { ukBusinessHoursBetween } from "@/lib/uk-business-hours";
import { jiraIssueBrowseUrl } from "@/lib/jira-issue-url";
import {
  changelogHistories,
  isChangelogTruncated,
  latestChangelogHistory,
  type JiraChangelogHistory,
} from "@/lib/jira-changelog";
import {
  pickLatestActivity,
  type JiraComment,
} from "@/lib/jira-activity";
import { responseCycleHours } from "@/lib/support-response-cycles";
import {
  metricsFromTickets as computeSupportTicketMetrics,
  type SupportTicketMetrics,
} from "@/lib/support-ticket-metrics";

export type { SupportTicketMetrics };

export interface SupportTicket {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
  assigneeEmail: string | null;
  created: string | null;
  updated: string | null;
  browseUrl: string | null;
  lastActivity: string | null;
  lastActivityAt: string | null;
  hoursSinceActivity: number | null;
  responseCycleHours: number[];
}

export class SupportTicketsService {
  constructor(
    private readonly jiraClient: JiraApiClient,
    private readonly settingsService: SettingsService,
    private readonly reminderRepo: SupportTicketReminderRepository,
  ) {}

  async getTickets(): Promise<SupportTicket[]> {
    const spaceKey = await this.settingsService.getSupportDeskSpaceKey();
    if (!spaceKey) {
      throw new Error("Support desk space key not configured");
    }

    const creds = await this.settingsService.getJiraCredentials();
    const jql = `project = "${spaceKey}" AND statusCategory != Done ORDER BY updated DESC`;
    const result = await this.jiraClient.searchAllIssues({
      jql,
      expand: "changelog",
      fields: [
        "summary",
        "status",
        "assignee",
        "created",
        "updated",
      ],
    });

    const now = new Date();
    return Promise.all(
      result.map(async (issue) => {
        const [histories, comment] = await Promise.all([
          this.resolveChangelog(issue),
          this.jiraClient.getLatestComment(issue.key),
        ]);
        return this.mapIssueToTicket(issue, {
          histories,
          comment,
          browseBaseUrl: creds.browseBaseUrl,
          now,
        });
      }),
    );
  }

  metricsFromTickets(tickets: SupportTicket[]): SupportTicketMetrics {
    return computeSupportTicketMetrics(tickets);
  }

  async sendStaleTicketReminders(): Promise<{
    sent: number;
    skipped: number;
    errors: number;
  }> {
    const spaceKey = await this.settingsService.getSupportDeskSpaceKey();
    if (!spaceKey) {
      log.warn("support-tickets", "Support desk space key not configured");
      return { sent: 0, skipped: 0, errors: 0 };
    }

    const slackBotToken = await this.settingsService.getSlackBotToken();
    if (!slackBotToken) {
      log.warn("support-tickets", "Slack bot token not configured");
      return { sent: 0, skipped: 0, errors: 0 };
    }

    const slackClient = createSlackBotClient({ botToken: slackBotToken });

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const jql = `project = "${spaceKey}" AND status = "In Progress" AND updated < -24h ORDER BY updated ASC`;

    const result = await this.jiraClient.searchAllIssues({
      jql,
      fields: [
        "summary",
        "status",
        "assignee",
        "created",
        "updated",
      ],
    });

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const issue of result) {
      const ticket = this.mapIssueToTicket(issue);
      
      if (!ticket.assigneeEmail) {
        log.debug("support-tickets", `Skipping ticket ${ticket.key}: no assignee email`);
        skipped++;
        continue;
      }

      const hasRecent = await this.reminderRepo.hasRecentReminder(
        ticket.key,
        twentyFourHoursAgo,
      );

      if (hasRecent) {
        log.debug("support-tickets", `Skipping ticket ${ticket.key}: reminder already sent recently`);
        skipped++;
        continue;
      }

      try {
        const slackUser = await slackClient.findUserByEmail(ticket.assigneeEmail);
        if (!slackUser) {
          log.warn("support-tickets", `Could not find Slack user for email: ${ticket.assigneeEmail}`);
          errors++;
          continue;
        }

        const message = `⏰ Reminder: Support ticket *${ticket.key}* has not been updated in over 24 hours.\n\n*Summary:* ${ticket.summary}\n*Status:* ${ticket.status}\n*Last Updated:* ${ticket.updated ? new Date(ticket.updated).toLocaleString() : "Unknown"}\n\nPlease update the ticket or mark it as complete.`;

        await slackClient.sendDirectMessage(slackUser.id, message);

        await this.reminderRepo.create({
          jiraIssueKey: ticket.key,
          assigneeEmail: ticket.assigneeEmail,
          slackUserId: slackUser.id,
        });

        log.info("support-tickets", `Sent reminder for ticket ${ticket.key} to ${ticket.assigneeEmail}`);
        sent++;
      } catch (err) {
        log.error("support-tickets", `Failed to send reminder for ticket ${ticket.key}`, {
          error: err instanceof Error ? err.message : String(err),
        });
        errors++;
      }
    }

    return { sent, skipped, errors };
  }

  private async resolveChangelog(
    issue: JiraIssue,
  ): Promise<JiraChangelogHistory[]> {
    const existing = changelogHistories(issue.changelog);
    if (existing.length > 0 && !isChangelogTruncated(issue.changelog)) {
      return existing;
    }
    const fetched = await this.jiraClient.getIssueChangelog(issue.key);
    return fetched.length > 0 ? fetched : existing;
  }

  private mapIssueToTicket(
    issue: JiraIssue,
    extras?: {
      histories?: JiraChangelogHistory[];
      comment?: JiraComment | null;
      browseBaseUrl?: string | null;
      now?: Date;
    },
  ): SupportTicket {
    const assignee = issue.fields.assignee as {
      displayName?: string;
      emailAddress?: string;
    } | null;
    const created = issue.fields.created ?? null;
    const histories =
      extras?.histories ?? changelogHistories(issue.changelog);
    const history = latestChangelogHistory({ histories });
    const activity = pickLatestActivity({
      history,
      comment: extras?.comment,
      created,
    });
    const lastActivityAt = activity?.at ?? null;
    const lastActivity = activity?.summary ?? null;
    const now = extras?.now ?? new Date();
    const hoursSinceActivity =
      lastActivityAt != null
        ? ukBusinessHoursBetween(new Date(lastActivityAt), now)
        : null;

    return {
      key: issue.key,
      summary: issue.fields.summary ?? "No summary",
      status: issue.fields.status?.name ?? "Unknown",
      assignee: assignee?.displayName ?? null,
      assigneeEmail: assignee?.emailAddress ?? null,
      created,
      updated: issue.fields.updated ?? null,
      browseUrl: jiraIssueBrowseUrl(extras?.browseBaseUrl, issue.key),
      lastActivity,
      lastActivityAt,
      hoursSinceActivity,
      responseCycleHours: responseCycleHours({ created, histories }),
    };
  }
}

export function createSupportTicketsService(db: Db = getDb()) {
  const settingsService = new SettingsService(
    new (require("@/repositories/settings-repository").SettingsRepository)(db),
  );
  const reminderRepo = new SupportTicketReminderRepository(db);
  
  return async (): Promise<SupportTicketsService | null> => {
    const jiraClient = await settingsService.createConfiguredJiraClient();
    if (!jiraClient) {
      return null;
    }
    return new SupportTicketsService(jiraClient, settingsService, reminderRepo);
  };
}
