import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleIdTokenProfile = {
  sub: string;
  email: string;
  email_verified: boolean;
  hd?: string;
};

function nonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function profileFromGooglePayload(
  payload: JWTPayload | Record<string, unknown>,
): GoogleIdTokenProfile {
  const record = payload as Record<string, unknown>;
  const sub = nonEmpty(record.sub);
  const email = nonEmpty(record.email);
  if (!sub || !email) {
    throw new Error("Google profile missing sub/email");
  }
  const verified =
    record.email_verified === true || record.email_verified === "true";
  if (!verified) {
    throw new Error("Google email is not verified");
  }
  const hd = nonEmpty(record.hd) ?? undefined;
  return { sub, email, email_verified: true, hd };
}

export async function verifyGoogleIdToken(
  idToken: string,
  audiences: string[],
): Promise<GoogleIdTokenProfile> {
  if (audiences.length === 0) {
    throw new Error("Google OAuth is not configured");
  }
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: GOOGLE_ISSUERS,
    audience: audiences,
  });
  return profileFromGooglePayload(payload);
}
