"use server";

import { cookies } from "next/headers";

export async function setAdminSession(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || apiKey !== expected) {
    return { ok: false, error: "Invalid admin API key" };
  }

  const cookieStore = await cookies();
  cookieStore.set("admin_api_key", apiKey, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return { ok: true };
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("admin_api_key");
}
