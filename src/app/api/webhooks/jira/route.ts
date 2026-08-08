import { after } from "next/server";
import {
  verifyHubSignature,
  verifyWebhookToken,
} from "@/lib/webhook-auth";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { createWorklogSyncService } from "@/services/worklog-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = getEnv().JIRA_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { error: "JIRA_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const hubSignature = request.headers.get("x-hub-signature");
  const webhookToken = request.headers.get("x-webhook-token");

  const authorized = hubSignature
    ? verifyHubSignature(hubSignature, rawBody, secret)
    : webhookToken
      ? verifyWebhookToken(webhookToken, secret)
      : false;

  if (!authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    log.error("webhook/jira", err, { phase: "parse", rawBody });
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const service = createWorklogSyncService();
    const accepted = await service.accept(payload, rawBody);

    log.info("webhook/jira", "accepted", {
      syncId: accepted.syncId,
      duplicate: accepted.duplicate,
      shouldProcess: accepted.shouldProcess,
      reason: accepted.reason ?? null,
      eventType: accepted.eventType ?? null,
      jiraWorklogId: accepted.jiraWorklogId ?? null,
    });

    if (accepted.shouldProcess && accepted.syncId) {
      const syncId = accepted.syncId;
      after(async () => {
        try {
          await createWorklogSyncService().process(payload, rawBody, syncId);
        } catch (err) {
          log.error("webhook/jira", err, {
            phase: "background",
            syncId,
          });
        }
      });
    }

    return Response.json(
      {
        ok: true,
        accepted: true,
        syncId: accepted.syncId,
        duplicate: accepted.duplicate,
        shouldProcess: accepted.shouldProcess,
        reason: accepted.reason ?? null,
      },
      { status: 202 },
    );
  } catch (err) {
    log.error("webhook/jira", err, { phase: "accept" });
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "accept_failed",
      },
      { status: 500 },
    );
  }
}
