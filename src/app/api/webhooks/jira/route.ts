import { after } from "next/server";
import { getDb } from "@/db";
import { verifyWebhookToken } from "@/lib/webhook-auth";
import {
  acceptWorklogWebhook,
  processWorklogWebhook,
} from "@/services/worklog-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.JIRA_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { error: "JIRA_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }

  const token = request.headers.get("x-webhook-token");
  if (!verifyWebhookToken(token, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const db = getDb();
    const accepted = await acceptWorklogWebhook(payload, rawBody, db);

    if (accepted.shouldProcess && accepted.syncId) {
      const syncId = accepted.syncId;
      after(async () => {
        try {
          await processWorklogWebhook(payload, rawBody, {
            db: getDb(),
            syncId,
          });
        } catch (err) {
          console.error("[webhook/jira] Background processing error", err);
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
    console.error("[webhook/jira] Accept error", err);
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "accept_failed",
      },
      { status: 500 },
    );
  }
}
