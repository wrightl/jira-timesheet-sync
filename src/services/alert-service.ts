import { getDb, type Db } from "@/db";
import {
  DEFAULT_ALERT_THRESHOLDS,
  parseAlertThresholds,
  type AlertThresholds,
} from "@/lib/alert-thresholds";
import { decryptSecret, encryptSecret, maskToken } from "@/lib/crypto";
import {
  isEmailDigestConfigured,
  sendAlertEmailDigest,
} from "@/lib/email-digest";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { isAllowedSlackWebhookUrl } from "@/lib/outbound-urls";
import { SettingsRepository } from "@/repositories/settings-repository";
import {
  createPortfolioService,
  type PortfolioService,
} from "@/services/portfolio-service";
import {
  createSettingsService,
  type SettingsService,
} from "@/services/settings-service";

export type AlertItem = {
  severity: "risk" | "watch" | "info";
  title: string;
  detail: string;
  href?: string;
};

export type AlertRunResult = {
  generatedAt: string;
  alerts: AlertItem[];
  slackDelivered: boolean;
  slackError: string | null;
  emailDelivered: boolean;
  emailError: string | null;
  digestText: string;
};

function nonEmpty(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class AlertService {
  constructor(
    private readonly settingsRepo: SettingsRepository,
    private readonly settings: SettingsService,
    private readonly portfolio: PortfolioService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getAlertConfig(): Promise<{
    hasSlackWebhook: boolean;
    maskedSlackWebhook: string | null;
    alertEmail: string | null;
    thresholds: AlertThresholds;
    emailDeliveryConfigured: boolean;
  }> {
    const env = getEnv();
    const row = await this.settingsRepo.getDefault();
    const key = env.SETTINGS_ENCRYPTION_KEY;
    let webhook: string | null = null;
    if (row?.slackWebhookUrlEncrypted && key) {
      try {
        webhook = decryptSecret(row.slackWebhookUrlEncrypted, key);
      } catch {
        webhook = null;
      }
    }
    return {
      hasSlackWebhook: Boolean(webhook),
      maskedSlackWebhook: webhook ? maskToken(webhook) : null,
      alertEmail: nonEmpty(row?.alertEmail),
      thresholds: parseAlertThresholds(row?.alertThresholdsJson),
      emailDeliveryConfigured: isEmailDigestConfigured(),
    };
  }

  async saveAlertConfig(input: {
    slackWebhookUrl?: string;
    alertEmail?: string | null;
    thresholds?: Partial<AlertThresholds>;
  }): Promise<void> {
    const env = getEnv();
    const key = env.SETTINGS_ENCRYPTION_KEY;
    if (!key) throw new Error("SETTINGS_ENCRYPTION_KEY is not configured");

    const existing = await this.settingsRepo.getDefault();
    let encryptedWebhook: string | null | undefined = undefined;
    if (input.slackWebhookUrl !== undefined) {
      const trimmed = input.slackWebhookUrl.trim();
      encryptedWebhook =
        trimmed.length > 0
          ? encryptSecret(trimmed, key)
          : existing?.slackWebhookUrlEncrypted ?? null;
    }

    const currentThresholds = parseAlertThresholds(
      existing?.alertThresholdsJson,
    );
    const nextThresholds = input.thresholds
      ? { ...currentThresholds, ...input.thresholds }
      : null;

    await this.settingsRepo.upsertAlertSettings({
      slackWebhookUrlEncrypted: encryptedWebhook,
      alertEmail:
        input.alertEmail !== undefined
          ? nonEmpty(input.alertEmail)
          : undefined,
      alertThresholdsJson: nextThresholds
        ? JSON.stringify(nextThresholds)
        : undefined,
    });
  }

  async evaluate(options?: {
    deliver?: boolean;
    weeklyDigest?: boolean;
    /** Scope portfolio alerts to teams owned by this app user. */
    mineForUserId?: string | null;
    teamId?: string | null;
  }): Promise<AlertRunResult> {
    const config = await this.getAlertConfig();
    const thresholds = config.thresholds;
    const portfolio = await this.portfolio.getPortfolio({
      thresholds,
      mineForUserId: options?.mineForUserId ?? null,
      teamId: options?.teamId ?? null,
    });
    const alerts: AlertItem[] = [];

    if (portfolio.syncFailedOpen >= thresholds.syncFailedOpenRisk) {
      alerts.push({
        severity: "risk",
        title: "Sync failures open",
        detail: `${portfolio.syncFailedOpen} failed sync events need attention`,
        href: "/syncs",
      });
    } else if (portfolio.syncFailedOpen > 0) {
      alerts.push({
        severity: "watch",
        title: "Sync failures open",
        detail: `${portfolio.syncFailedOpen} failed sync events`,
        href: "/syncs",
      });
    }

    for (const project of portfolio.projects) {
      if (project.riskTier !== "risk" && project.riskTier !== "watch") continue;
      const owners =
        project.owningTeamNames?.length > 0
          ? ` · owned by ${project.owningTeamNames.join(", ")}`
          : "";
      alerts.push({
        severity: project.riskTier,
        title: project.projectName ?? project.projectKey ?? project.projectId,
        detail:
          (project.riskReasons.join("; ") ||
            `${project.riskTier} project in portfolio`) + owners,
        href: `/projects?projectId=${encodeURIComponent(project.projectId)}${
          project.clientId
            ? `&clientId=${encodeURIComponent(project.clientId)}`
            : ""
        }`,
      });
    }

    alerts.sort((a, b) => {
      const rank = (s: AlertItem["severity"]) =>
        s === "risk" ? 0 : s === "watch" ? 1 : 2;
      return rank(a.severity) - rank(b.severity);
    });

    const digestText = this.formatDigest(alerts, {
      weekly: Boolean(options?.weeklyDigest),
      summary: portfolio.summary,
    });

    let slackDelivered = false;
    let slackError: string | null = null;
    let emailDelivered = false;
    let emailError: string | null = null;

    if (options?.deliver !== false) {
      if (config.hasSlackWebhook) {
        try {
          await this.deliverSlack(digestText);
          slackDelivered = true;
        } catch (err) {
          slackError = err instanceof Error ? err.message : String(err);
          log.warn("alerts", "Slack delivery failed", { error: slackError });
        }
      }

      if (config.alertEmail) {
        if (!config.emailDeliveryConfigured) {
          emailError =
            "RESEND_API_KEY and EMAIL_FROM are required to deliver alert email";
        } else {
          try {
            await sendAlertEmailDigest({
              to: config.alertEmail,
              subject: options?.weeklyDigest
                ? "Weekly engineering digest"
                : "Engineering risk alerts",
              digestText,
              fetchImpl: this.fetchImpl,
            });
            emailDelivered = true;
          } catch (err) {
            emailError = err instanceof Error ? err.message : String(err);
            log.warn("alerts", "Email delivery failed", { error: emailError });
          }
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      alerts,
      slackDelivered,
      slackError,
      emailDelivered,
      emailError,
      digestText,
    };
  }

  private formatDigest(
    alerts: AlertItem[],
    options: {
      weekly: boolean;
      summary: {
        projectCount: number;
        riskCount: number;
        watchCount: number;
        okCount: number;
      };
    },
  ): string {
    const heading = options.weekly
      ? "*Weekly engineering digest*"
      : "*Engineering risk alerts*";
    const lines = [
      heading,
      `Portfolio: ${options.summary.projectCount} active · ${options.summary.riskCount} risk · ${options.summary.watchCount} watch · ${options.summary.okCount} ok`,
    ];
    if (alerts.length === 0) {
      lines.push("No threshold breaches right now.");
    } else {
      for (const alert of alerts.slice(0, 25)) {
        const icon =
          alert.severity === "risk"
            ? ":red_circle:"
            : alert.severity === "watch"
              ? ":large_yellow_circle:"
              : ":information_source:";
        lines.push(`${icon} *${alert.title}* — ${alert.detail}`);
      }
      if (alerts.length > 25) {
        lines.push(`_…and ${alerts.length - 25} more_`);
      }
    }
    return lines.join("\n");
  }

  private async deliverSlack(text: string): Promise<void> {
    const env = getEnv();
    const key = env.SETTINGS_ENCRYPTION_KEY;
    const row = await this.settingsRepo.getDefault();
    if (!row?.slackWebhookUrlEncrypted || !key) {
      throw new Error("Slack webhook is not configured");
    }
    const webhook = decryptSecret(row.slackWebhookUrlEncrypted, key);
    if (!isAllowedSlackWebhookUrl(webhook)) {
      throw new Error(
        "Slack webhook URL is not an allowed https://hooks.slack.com endpoint",
      );
    }
    const res = await this.fetchImpl(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Slack webhook failed (${res.status}): ${body.slice(0, 200)}`,
      );
    }
  }
}

export function createAlertService(
  db: Db = getDb(),
  fetchImpl: typeof fetch = fetch,
) {
  const settings = createSettingsService(db);
  return new AlertService(
    new SettingsRepository(db),
    settings,
    createPortfolioService(db, settings),
    fetchImpl,
  );
}

export { DEFAULT_ALERT_THRESHOLDS };
