import { NextRequest } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/password";
import {
  createGoogleOAuthService,
  isGoogleOAuthConfigured,
} from "@/services/google-oauth-service";
import { getEnv } from "@/lib/env";

const STATE_COOKIE = "oauth_google_state";

function clearStateCookie(): string {
  return `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
    process.env.NODE_ENV === "production" ? "; Secure" : ""
  }`;
}

function appBase(): string {
  return (getEnv().APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function GET(request: NextRequest) {
  if (!isGoogleOAuthConfigured()) {
    return Response.redirect(`${appBase()}/login?error=oauth_disabled`, 302);
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) {
    const res = Response.redirect(`${appBase()}/login?error=oauth_state`, 302);
    res.headers.append("Set-Cookie", clearStateCookie());
    return res;
  }

  try {
    const result = await createGoogleOAuthService().exchangeCode(code);
    const res = Response.redirect(`${appBase()}/`, 302);
    const opts = sessionCookieOptions(result.expiresAt);
    res.headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=${result.token}; Path=${opts.path}; HttpOnly; SameSite=Lax; Expires=${opts.expires.toUTCString()}${
        opts.secure ? "; Secure" : ""
      }`,
    );
    res.headers.append("Set-Cookie", clearStateCookie());
    return res;
  } catch {
    const res = Response.redirect(`${appBase()}/login?error=oauth_failed`, 302);
    res.headers.append("Set-Cookie", clearStateCookie());
    return res;
  }
}
