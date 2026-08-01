import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Verify Jira Cloud webhook HMAC signature (X-Hub-Signature: sha256=<hex>).
 * Uses the Atlassian WebSub-style format.
 */
export function verifyJiraWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const match = /^sha256=([a-f0-9]+)$/i.exec(signatureHeader.trim());
  if (!match) {
    return false;
  }

  const receivedHex = match[1].toLowerCase();
  const expectedHex = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    const received = Buffer.from(receivedHex, "hex");
    const expected = Buffer.from(expectedHex, "hex");
    if (received.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

export function hashPayload(rawBody: string | Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
