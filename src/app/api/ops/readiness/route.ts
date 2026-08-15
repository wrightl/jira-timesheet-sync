import { requireAdmin, requireAuth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { isGoogleOAuthConfigured } from "@/services/google-oauth-service";
import { createAlertService } from "@/services/alert-service";
import { createSettingsService } from "@/services/settings-service";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Admin ops readiness for production / preview verification after deploy.
 * Reports whether schema-backed settings and env knobs needed for EM/HoE
 * features are configured (does not expose secrets).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;

  const env = getEnv();
  const settings = createSettingsService();
  const alerts = createAlertService();

  let database: "ok" | "error" = "ok";
  let databaseDetail = "Connected";
  try {
    // Touch settings row as a cheap schema/connectivity check
    await settings.getStatus();
  } catch (error) {
    database = "error";
    databaseDetail =
      error instanceof Error ? error.message : "Database unreachable";
  }

  const [status, alertConfig] = await Promise.all([
    settings.getStatus(),
    alerts.getAlertConfig(),
  ]);

  const checks = {
    database: database === "ok",
    encryptionKey: Boolean(env.SETTINGS_ENCRYPTION_KEY),
    bitmapToken: status.hasToken,
    jiraCredentials: status.hasJiraToken && Boolean(status.jiraBaseUrl),
    slackWebhook: alertConfig.hasSlackWebhook,
    alertEmail: Boolean(alertConfig.alertEmail),
    cronSecret: Boolean(env.CRON_SECRET),
    appBaseUrl: Boolean(env.APP_BASE_URL),
    googleOAuth: isGoogleOAuthConfigured(),
    resendEmail: Boolean(env.RESEND_API_KEY) && Boolean(env.EMAIL_FROM),
  };

  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  return Response.json({
    status: missing.length === 0 ? "ready" : "incomplete",
    checks: {
      ...checks,
      databaseDetail,
    },
    missing,
    hints: {
      schemaSync:
        "Vercel builds run scripts/migrate-on-build.mjs (drizzle-kit push --force).",
      slackWebhook: "Settings → Slack alerts (encrypted webhook URL).",
      cronSecret:
        "Set CRON_SECRET and call /api/alerts/run with Authorization: Bearer …",
      googleOAuth:
        "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_BASE_URL for SSO.",
      resendEmail:
        "Set RESEND_API_KEY and EMAIL_FROM to deliver alert digests by email.",
      readiness: "GET /api/ops/readiness (admin session) after each deploy.",
    },
    timestamp: new Date().toISOString(),
  });
}
