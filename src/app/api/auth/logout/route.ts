import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { destroySession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/password";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  try {
    const db = getDb();
    await destroySession(db, token);
  } catch (err) {
    console.warn("[auth/logout] session cleanup failed", err);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
