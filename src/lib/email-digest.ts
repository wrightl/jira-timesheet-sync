import { getEnv } from "@/lib/env";

/** Strip Slack-oriented markup for plain-text email. */
export function slackDigestToPlainText(digestText: string): string {
  return digestText
    .replace(/:[a-z0-9_+-]+:/gi, "")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type SendAlertEmailInput = {
  to: string;
  subject: string;
  digestText: string;
  fetchImpl?: typeof fetch;
};

/**
 * Deliver an alert digest via Resend HTTPS API.
 * Requires RESEND_API_KEY and EMAIL_FROM.
 */
export async function sendAlertEmailDigest(
  input: SendAlertEmailInput,
): Promise<void> {
  const env = getEnv();
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM are required for email digests");
  }
  const to = input.to.trim();
  if (!to) throw new Error("Alert email address is empty");

  const fetchImpl = input.fetchImpl ?? fetch;
  const text = slackDigestToPlainText(input.digestText);
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: input.subject,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Resend email failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }
}

export function isEmailDigestConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}
