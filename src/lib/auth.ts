import { and, eq, gt } from "drizzle-orm";
import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import type { Db } from "@/db";
import { getDb } from "@/db";
import { sessions, users, type AppUser } from "@/db/schema";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionToken,
} from "@/lib/password";

export type AuthUser = Pick<AppUser, "id" | "email" | "role">;

export type AuthSuccess = { user: AuthUser; error?: undefined };
export type AuthFailure = { user?: undefined; error: Response };
export type AuthResult = AuthSuccess | AuthFailure;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function unauthorized(message = "Unauthorized"): Response {
  return Response.json({ error: message }, { status: 401 });
}

function forbidden(message = "Forbidden"): Response {
  return Response.json({ error: message }, { status: 403 });
}

async function resolveSessionUser(
  db: Db,
  token: string,
): Promise<AuthUser | null> {
  const now = new Date();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
    .limit(1);

  return rows[0] ?? null;
}

function adminApiKeyFromRequest(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return null;
}

/** Optional ADMIN_API_KEY Bearer fallback for admin API tooling. */
function tryAdminApiKey(request: NextRequest): AuthUser | null {
  const expected = process.env.ADMIN_API_KEY;
  const provided = adminApiKeyFromRequest(request);
  if (!expected || !provided || !safeEqual(provided, expected)) {
    return null;
  }
  return {
    id: "admin-api-key",
    email: "admin-api-key@local",
    role: "admin",
  };
}

export async function getSessionUser(
  request: NextRequest,
): Promise<AuthUser | null> {
  const apiKeyUser = tryAdminApiKey(request);
  if (apiKeyUser) return apiKeyUser;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getDb();
  return resolveSessionUser(db, token);
}

export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const user = await getSessionUser(request);
  if (!user) {
    return { error: unauthorized() };
  }
  return { user };
}

export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
  const result = await requireAuth(request);
  if (result.error) return result;
  if (result.user.role !== "admin") {
    return { error: forbidden("Admin access required") };
  }
  return result;
}

/** @deprecated Prefer requireAdmin. Kept for gradual migration. */
export function requireAdminAuth(request: NextRequest): Response | null {
  // Sync wrapper cannot await sessions — callers should migrate to requireAdmin.
  // Fall back to ADMIN_API_KEY only for backward compatibility in sync contexts.
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    return Response.json(
      { error: "ADMIN_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const header = request.headers.get("authorization");
  const cookie = request.cookies.get("admin_api_key")?.value;
  let provided: string | null = null;

  if (header?.startsWith("Bearer ")) {
    provided = header.slice(7).trim();
  } else if (cookie) {
    provided = cookie;
  }

  if (!provided || !safeEqual(provided, expected)) {
    return unauthorized();
  }

  return null;
}

export async function createSession(
  db: Db,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    userId,
    token,
    expiresAt,
  });
  return { token, expiresAt };
}

export async function destroySession(
  db: Db,
  token: string | undefined,
): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.token, token));
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

/** Server-component helper: resolve user from cookies(). */
export async function getUserFromCookies(
  cookieStore: Awaited<ReturnType<typeof import("next/headers").cookies>>,
): Promise<AuthUser | null> {
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const db = getDb();
    return resolveSessionUser(db, token);
  } catch {
    return null;
  }
}
