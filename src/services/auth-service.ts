import { getDb, type Db } from "@/db";
import { UsersRepository } from "@/repositories/users-repository";
import { SessionsRepository } from "@/repositories/sessions-repository";
import { allowPublicRegister } from "@/lib/env";
import { normaliseEmail } from "@/lib/email";
import {
  SESSION_TTL_MS,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "@/lib/password";
import type { AuthUser } from "@/lib/auth-types";

export type LoginResult =
  | { user: AuthUser; token: string; expiresAt: Date }
  | { error: "invalid_credentials" };

export type RegisterResult =
  | { user: AuthUser; token: string; expiresAt: Date }
  | { error: "disabled" | "conflict" };

export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
  ) {}

  async resolveSessionUser(token: string): Promise<AuthUser | null> {
    const hashed = hashSessionToken(token);
    const user = await this.sessions.findValidUserByToken(hashed);
    if (user) return user;
    // Dual-read: pre-hash rows until the SQL migration (or TTL) clears them.
    if (hashed !== token) {
      return this.sessions.findValidUserByToken(token);
    }
    return null;
  }

  async login(emailRaw: string, password: string): Promise<LoginResult> {
    const email = normaliseEmail(emailRaw);
    const user = await this.users.findByEmail(email);
    if (!user) return { error: "invalid_credentials" };

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return { error: "invalid_credentials" };

    const session = await this.createSession(user.id);
    return {
      user: { id: user.id, email: user.email, role: user.role },
      ...session,
    };
  }

  async register(emailRaw: string, password: string): Promise<RegisterResult> {
    if (!allowPublicRegister()) {
      return { error: "disabled" };
    }

    const email = normaliseEmail(emailRaw);
    const existing = await this.users.findByEmail(email);
    if (existing) {
      return { error: "conflict" };
    }

    const passwordHash = await hashPassword(password);

    try {
      const user = await this.users.createFull({
        email,
        passwordHash,
        role: "user",
        mustSetPassword: false,
      });
      const session = await this.createSession(user.id);
      return {
        user: { id: user.id, email: user.email, role: user.role },
        ...session,
      };
    } catch {
      return { error: "conflict" };
    }
  }

  async createSession(
    userId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.sessions.create({
      userId,
      token: hashSessionToken(token),
      expiresAt,
    });
    return { token, expiresAt };
  }

  async destroySession(token: string | undefined): Promise<void> {
    if (!token) return;
    const hashed = hashSessionToken(token);
    await this.sessions.deleteByToken(hashed);
    if (hashed !== token) {
      await this.sessions.deleteByToken(token);
    }
  }
}

export function createAuthService(db: Db = getDb()) {
  return new AuthService(new UsersRepository(db), new SessionsRepository(db));
}
