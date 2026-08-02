import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSession, sessionCookieOptions } from "@/lib/auth";
import { hashPassword, normalizeEmail, SESSION_COOKIE } from "@/lib/password";
import { registerSchema } from "@/lib/validators";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const passwordHash = await hashPassword(parsed.data.password);
  const db = getDb();

  try {
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        role: "user",
      })
      .returning({ id: users.id, email: users.email, role: users.role });

    const { token, expiresAt } = await createSession(db, user.id);
    const response = NextResponse.json(
      { user: { id: user.id, email: user.email, role: user.role } },
      { status: 201 },
    );
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return response;
  } catch (err) {
    console.error("[auth/register] failed", err);
    return NextResponse.json(
      { error: "Email already registered" },
      { status: 409 },
    );
  }
}
