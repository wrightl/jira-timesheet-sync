import { createHash, randomBytes } from "crypto";
import bcrypt from "bcrypt";

export { normaliseEmail } from "@/lib/email";

const BCRYPT_ROUNDS = 12;
export const SESSION_COOKIE = "session_token";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 hex digest stored in `sessions.token` (cookie keeps the plaintext). */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
