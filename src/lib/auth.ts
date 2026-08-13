import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { createAuthService } from "@/services/auth-service";
import { SESSION_COOKIE } from "@/lib/password";
import type { AuthResult, AuthUser } from "@/lib/auth-types";

export type { AuthUser, AuthSuccess, AuthFailure, AuthResult } from "@/lib/auth-types";

function unauthorized(message = "Unauthorized"): Response {
  return Response.json({ error: message }, { status: 401 });
}

function forbidden(message = "Forbidden"): Response {
  return Response.json({ error: message }, { status: 403 });
}

export async function getSessionUser(
  request: NextRequest,
): Promise<AuthUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return createAuthService().resolveSessionUser(token);
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

export async function createSession(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  return createAuthService(db).createSession(userId);
}

export async function destroySession(
  db: ReturnType<typeof getDb>,
  token: string | undefined,
): Promise<void> {
  return createAuthService(db).destroySession(token);
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
    return createAuthService().resolveSessionUser(token);
  } catch {
    return null;
  }
}

/** Collapse page auth + role gate for App Router pages. */
export async function requirePageUser(options?: {
  role?: "admin";
}): Promise<AuthUser> {
  const { cookies } = await import("next/headers");
  const { redirect } = await import("next/navigation");
  const cookieStore = await cookies();
  const user = await getUserFromCookies(cookieStore);
  if (!user) {
    redirect("/login");
  }
  if (options?.role === "admin" && user!.role !== "admin") {
    redirect(user!.role === "exec" ? "/portfolio" : "/my-mappings");
  }
  return user!;
}
