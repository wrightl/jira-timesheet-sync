import { NextRequest } from "next/server";
import {
  createGoogleOAuthService,
  createOAuthState,
  isGoogleOAuthConfigured,
} from "@/services/google-oauth-service";

const STATE_COOKIE = "oauth_google_state";

export async function GET(request: NextRequest) {
  if (!isGoogleOAuthConfigured()) {
    return Response.json(
      { error: "Google OAuth is not configured" },
      { status: 503 },
    );
  }

  const state = createOAuthState();
  const url = createGoogleOAuthService().buildAuthoriseUrl(state);
  const response = Response.redirect(url, 302);
  response.headers.append(
    "Set-Cookie",
    `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
  );
  void request;
  return response;
}
