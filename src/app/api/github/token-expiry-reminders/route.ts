import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { matchesBearerSecret } from "@/lib/timing-safe";
import { createGithubTokenExpiryReminderService } from "@/services/github-token-expiry-reminder-service";

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
    const result = await createGithubTokenExpiryReminderService().run();
    log.info("github-token-expiry", "Reminder run complete", result);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send GitHub token reminders";
    log.error("github-token-expiry", "Reminder run failed", { error: message });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
