import { getDb } from "@/db";
import { verifyJiraWebhookSignature } from "@/lib/webhook-signature";
import { processWorklogWebhook } from "@/services/worklog-sync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.JIRA_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { error: "JIRA_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature");

  if (!verifyJiraWebhookSignature(rawBody, signature, secret)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await processWorklogWebhook(payload, rawBody, {
      db: getDb(),
    });
    return Response.json({ ok: true, result }, { status: 200 });
  } catch (err) {
    console.error("[webhook/jira] Processing error", err);
    // Acknowledge to avoid endless Jira retries for infra blips after accept;
    // durable failure is recorded inside the sync service when possible.
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "processing_failed",
      },
      { status: 200 },
    );
  }
}
