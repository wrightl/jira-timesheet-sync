import { NextRequest, NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { log } from "@/lib/log";
import { SESSION_COOKIE } from "@/lib/password";
import {
  AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS,
  authAttemptKey,
  clearAuthFailures,
  isAuthRateLimited,
  recordAuthFailure,
  requestClientIp,
} from "@/lib/rate-limit";
import { googleNativeAuthSchema } from "@/lib/validators";
import {
  createGoogleOAuthService,
  isGoogleNativeAuthConfigured,
} from "@/services/google-oauth-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isGoogleNativeAuthConfigured()) {
    return NextResponse.json(
      { error: "Google OAuth is not configured" },
      { status: 503 },
    );
  }

  const parsed = await parseJsonBody(request, googleNativeAuthSchema);
  if ("error" in parsed) return parsed.error;

  const limitKey = authAttemptKey("google-native", requestClientIp(request));
  if (isAuthRateLimited(limitKey)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS) },
      },
    );
  }

  try {
    const result = await createGoogleOAuthService().signInWithIdToken(
      parsed.data.idToken,
    );
    clearAuthFailures(limitKey);
    const response = NextResponse.json({
      user: result.user,
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
    });
    response.cookies.set(
      SESSION_COOKIE,
      result.token,
      sessionCookieOptions(result.expiresAt),
    );
    return response;
  } catch (err) {
    recordAuthFailure(limitKey);
    const message = err instanceof Error ? err.message : String(err);
    log.error(
      "auth/google/native",
      err instanceof Error ? err : new Error(message),
    );
    return NextResponse.json(
      { error: "Google sign-in failed" },
      { status: 401 },
    );
  }
}
