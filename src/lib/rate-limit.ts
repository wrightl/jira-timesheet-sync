const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const MAX_KEYS = 10_000;
const RETRY_AFTER_SECONDS = Math.ceil(WINDOW_MS / 1000);

type WindowEntry = { count: number; resetAt: number };

const windows = new Map<string, WindowEntry>();

export const AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS = RETRY_AFTER_SECONDS;

/** Best-effort client IP for Fluid Compute (X-Forwarded-For / X-Real-IP). */
export function requestClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function authAttemptKey(email: string, ip: string): string {
  return `${email.trim().toLowerCase()}|${ip}`;
}

function pruneExpired(now: number) {
  if (windows.size < MAX_KEYS) return;
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
    if (windows.size < MAX_KEYS) return;
  }
  const oldest = windows.keys().next().value;
  if (oldest) windows.delete(oldest);
}

export function isAuthRateLimited(key: string, now = Date.now()): boolean {
  const entry = windows.get(key);
  if (!entry) return false;
  if (entry.resetAt <= now) {
    windows.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

export function recordAuthFailure(key: string, now = Date.now()): void {
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    pruneExpired(now);
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function clearAuthFailures(key: string): void {
  windows.delete(key);
}

/** Test helper to clear in-memory windows. */
export function resetAuthRateLimitForTests(): void {
  windows.clear();
}
