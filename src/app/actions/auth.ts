"use server";

/** @deprecated Use /api/auth/login instead. Kept for any leftover imports. */
export async function setAdminSession(): Promise<{ ok: boolean; error?: string }> {
  return {
    ok: false,
    error: "Admin API key login is deprecated. Sign in with email and password.",
  };
}

export async function clearAdminSession(): Promise<void> {
  // no-op; sessions cleared via /api/auth/logout
}
