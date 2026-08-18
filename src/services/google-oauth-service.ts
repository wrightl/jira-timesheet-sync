import { createHash, randomBytes } from "node:crypto";
import { getDb, type Db } from "@/db";
import { getEnv } from "@/lib/env";
import { normaliseEmail } from "@/lib/email";
import {
  profileFromGooglePayload,
  verifyGoogleIdToken,
  type GoogleIdTokenProfile,
} from "@/lib/google-id-token";
import { hashPassword } from "@/lib/password";
import type { AuthUser } from "@/lib/auth-types";
import { UsersRepository } from "@/repositories/users-repository";
import { createAuthService, type AuthService } from "@/services/auth-service";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  allowedDomain: string | null;
  defaultRole: "user" | "exec";
};

export type GoogleAuthSharedConfig = {
  webClientId: string;
  iosClientId: string | null;
  allowedDomain: string | null;
  defaultRole: "user" | "exec";
};

function nonEmpty(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getGoogleAuthSharedConfig(): GoogleAuthSharedConfig | null {
  const env = getEnv();
  const webClientId = nonEmpty(env.GOOGLE_CLIENT_ID);
  if (!webClientId) return null;
  const allowedDomain = nonEmpty(env.GOOGLE_ALLOWED_DOMAIN);
  const nodeEnv = env.NODE_ENV ?? process.env.NODE_ENV;
  if (nodeEnv === "production" && !allowedDomain) {
    return null;
  }
  return {
    webClientId,
    iosClientId: nonEmpty(env.GOOGLE_IOS_CLIENT_ID),
    allowedDomain,
    defaultRole: env.GOOGLE_DEFAULT_ROLE === "exec" ? "exec" : "user",
  };
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const shared = getGoogleAuthSharedConfig();
  if (!shared) return null;
  const env = getEnv();
  const clientSecret = nonEmpty(env.GOOGLE_CLIENT_SECRET);
  const baseUrl = nonEmpty(env.APP_BASE_URL);
  if (!clientSecret || !baseUrl) return null;
  return {
    clientId: shared.webClientId,
    clientSecret,
    redirectUri: `${baseUrl.replace(/\/$/, "")}/api/auth/google/callback`,
    allowedDomain: shared.allowedDomain,
    defaultRole: shared.defaultRole,
  };
}

export function isGoogleOAuthConfigured(): boolean {
  return getGoogleOAuthConfig() != null;
}

export function isGoogleNativeAuthConfigured(): boolean {
  return getGoogleAuthSharedConfig() != null;
}

type GoogleProfileInput = {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  hd?: string;
};

export class GoogleOAuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly auth: AuthService,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly verifyIdToken: typeof verifyGoogleIdToken = verifyGoogleIdToken,
  ) {}

  buildAuthoriseUrl(state: string): string {
    const config = getGoogleOAuthConfig();
    if (!config) throw new Error("Google OAuth is not configured");
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "online",
      include_granted_scopes: "true",
      prompt: "select_account",
      state,
    });
    if (config.allowedDomain) {
      params.set("hd", config.allowedDomain);
    }
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async completeGoogleSignIn(
    profile: GoogleProfileInput | GoogleIdTokenProfile,
  ): Promise<{
    user: AuthUser;
    token: string;
    expiresAt: Date;
  }> {
    const config = getGoogleAuthSharedConfig();
    if (!config) throw new Error("Google OAuth is not configured");

    const normalised = profileFromGooglePayload({
      sub: profile.sub,
      email: profile.email,
      email_verified: profile.email_verified,
      hd: "hd" in profile ? profile.hd : undefined,
    });

    const email = normaliseEmail(normalised.email);
    if (config.allowedDomain) {
      const domain = email.split("@")[1] ?? "";
      const hd = nonEmpty(normalised.hd)?.toLowerCase();
      if (
        domain !== config.allowedDomain.toLowerCase() &&
        hd !== config.allowedDomain.toLowerCase()
      ) {
        throw new Error(
          `Google account must be in the ${config.allowedDomain} domain`,
        );
      }
    }

    let user = await this.users.findByOAuth("google", normalised.sub);
    if (!user) {
      user = await this.users.findByEmail(email);
      if (user) {
        if (!user.mustSetPassword) {
          throw new Error(
            "Google account email is already registered with a password",
          );
        }
        await this.users.update(user.id, {
          oauthProvider: "google",
          oauthSubject: normalised.sub,
          mustSetPassword: false,
        });
        user = await this.users.findById(user.id);
      } else {
        const randomPassword = randomBytes(32).toString("hex");
        const passwordHash = await hashPassword(randomPassword);
        user = await this.users.createFull({
          email,
          passwordHash,
          role: config.defaultRole,
          mustSetPassword: false,
          oauthProvider: "google",
          oauthSubject: normalised.sub,
        });
      }
    }

    if (!user) throw new Error("Failed to resolve Google user");

    const session = await this.auth.createSession(user.id);
    return {
      user: { id: user.id, email: user.email, role: user.role },
      ...session,
    };
  }

  async exchangeCode(code: string): Promise<{
    user: AuthUser;
    token: string;
    expiresAt: Date;
  }> {
    const config = getGoogleOAuthConfig();
    if (!config) throw new Error("Google OAuth is not configured");

    const tokenRes = await this.fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "");
      throw new Error(`Google token exchange failed: ${body.slice(0, 200)}`);
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      throw new Error("Google token response missing access_token");
    }

    const userRes = await this.fetchImpl(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!userRes.ok) {
      const body = await userRes.text().catch(() => "");
      throw new Error(`Google userinfo failed: ${body.slice(0, 200)}`);
    }
    const profile = (await userRes.json()) as GoogleProfileInput;
    return this.completeGoogleSignIn(profile);
  }

  async signInWithIdToken(idToken: string): Promise<{
    user: AuthUser;
    token: string;
    expiresAt: Date;
  }> {
    const config = getGoogleAuthSharedConfig();
    if (!config) throw new Error("Google OAuth is not configured");
    const audiences = [config.webClientId, config.iosClientId].filter(
      (id): id is string => Boolean(id),
    );
    const profile = await this.verifyIdToken(idToken, audiences);
    return this.completeGoogleSignIn(profile);
  }
}

export function createOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function createGoogleOAuthService(
  db: Db = getDb(),
  fetchImpl: typeof fetch = fetch,
) {
  return new GoogleOAuthService(
    new UsersRepository(db),
    createAuthService(db),
    fetchImpl,
  );
}
