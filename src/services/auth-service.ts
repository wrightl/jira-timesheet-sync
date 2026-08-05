import { getDb, type Db } from "@/db";
import { UsersRepository } from "@/repositories/users-repository";
import { SessionsRepository } from "@/repositories/sessions-repository";
import { allowPublicRegister } from "@/lib/env";
import { normalizeEmail } from "@/lib/email";
import {
  SESSION_TTL_MS,
  createSessionToken,
  hashPassword,
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
    return this.sessions.findValidUserByToken(token);
  }

  async login(emailRaw: string, password: string): Promise<LoginResult> {
    const email = normalizeEmail(emailRaw);
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

    const email = normalizeEmail(emailRaw);
    const passwordHash = await hashPassword(password);

    try {
      const user = await this.users.createFull({
        email,
        passwordHash,
        role: "user",
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
    await this.sessions.create({ userId, token, expiresAt });
    return { token, expiresAt };
  }

  async destroySession(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.sessions.deleteByToken(token);
  }
}

export function createAuthService(db: Db = getDb()) {
  return new AuthService(new UsersRepository(db), new SessionsRepository(db));
}
