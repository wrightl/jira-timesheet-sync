import { NextRequest, NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/password";
import {
  AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS,
  authAttemptKey,
  clearAuthFailures,
  isAuthRateLimited,
  recordAuthFailure,
  requestClientIp,
} from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validators";
import { createAuthService } from "@/services/auth-service";

export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody(request, registerSchema);
  if ("error" in parsed) return parsed.error;

  const limitKey = authAttemptKey(parsed.data.email, requestClientIp(request));
  if (isAuthRateLimited(limitKey)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS) },
      },
    );
  }

  const result = await createAuthService().register(
    parsed.data.email,
    parsed.data.password,
  );

  if ("error" in result) {
    recordAuthFailure(limitKey);
    if (result.error === "disabled") {
      return NextResponse.json(
        { error: "Public registration is disabled" },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "Email already registered" },
      { status: 409 },
    );
  }

  clearAuthFailures(limitKey);
  const response = NextResponse.json({ user: result.user }, { status: 201 });
  response.cookies.set(
    SESSION_COOKIE,
    result.token,
    sessionCookieOptions(result.expiresAt),
  );
  return response;
}
