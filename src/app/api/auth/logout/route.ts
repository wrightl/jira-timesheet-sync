import { NextRequest, NextResponse } from "next/server";
import { sessionTokenFromRequest } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/password";
import { createAuthService } from "@/services/auth-service";

export async function POST(request: NextRequest) {
  const token = sessionTokenFromRequest(request);
  await createAuthService().destroySession(token);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
  return response;
}
