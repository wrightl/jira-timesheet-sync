import { randomBytes } from "crypto";
import bcrypt from "bcrypt";

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

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
