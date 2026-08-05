import { NextRequest, NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/password";
import { loginSchema } from "@/lib/validators";
import { createAuthService } from "@/services/auth-service";

export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody(request, loginSchema);
  if ("error" in parsed) return parsed.error;

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
}
