import { createHash, timingSafeEqual } from "crypto";

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

export function hashPayload(rawBody: string | Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
