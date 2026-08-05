import { NextRequest, NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/password";
import { registerSchema } from "@/lib/validators";
import { createAuthService } from "@/services/auth-service";

export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody(request, registerSchema);
  if ("error" in parsed) return parsed.error;

  const result = await createAuthService().register(
    parsed.data.email,
    parsed.data.password,
  );

  if ("error" in result) {
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

  const response = NextResponse.json({ user: result.user }, { status: 201 });
  response.cookies.set(
    SESSION_COOKIE,
    result.token,
    sessionCookieOptions(result.expiresAt),
  );
  return response;
}
