import { NextRequest, NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { log } from "@/lib/log";
import { SESSION_COOKIE } from "@/lib/password";
import { loginSchema } from "@/lib/validators";
import { createAuthService } from "@/services/auth-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody(request, loginSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const result = await createAuthService().login(
      parsed.data.email,
      parsed.data.password,
    );

    if ("error" in result) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    const response = NextResponse.json({ user: result.user });
    response.cookies.set(
      SESSION_COOKIE,
      result.token,
      sessionCookieOptions(result.expiresAt),
    );
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("auth/login", err instanceof Error ? err : new Error(message));
    return NextResponse.json(
      {
        error:
          "Login could not be completed. If this is a preview deploy, ensure database migrations have been applied.",
        detail: process.env.NODE_ENV === "production" ? undefined : message,
      },
      { status: 500 },
    );
  }
}
