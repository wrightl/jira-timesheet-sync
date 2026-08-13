import { timingSafeEqual } from "crypto";

/**
 * Constant-time string compare. Returns false when either side is missing
 * or the UTF-8 lengths differ (same length-check pattern as webhook HMAC).
 */
export function timingSafeStringEqual(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Compare an Authorization header to `Bearer ${secret}`. Unset secret fails closed. */
export function matchesBearerSecret(
  authorizationHeader: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!secret) return false;
  return timingSafeStringEqual(authorizationHeader, `Bearer ${secret}`);
}
