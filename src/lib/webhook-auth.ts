import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Compare a webhook header token (X-Webhook-Token) to the configured secret.
 */
export function verifyWebhookToken(
  provided: string | null | undefined,
  expected: string,
): boolean {
  if (!provided || !expected) {
    return false;
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Verify a Jira Cloud / WebSub X-Hub-Signature header (sha256=<hex>).
 * HMAC is computed over the raw request body with the webhook secret.
 */
export function verifyHubSignature(
  signatureHeader: string | null | undefined,
  rawBody: string,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) {
    return false;
  }

  const hex = signatureHeader.slice(prefix.length);
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    return false;
  }

  let received: Buffer;
  try {
    received = Buffer.from(hex, "hex");
  } catch {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  if (received.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(received, expected);
}

export function hashPayload(rawBody: string | Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
