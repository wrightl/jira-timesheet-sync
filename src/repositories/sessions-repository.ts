import { and, eq, gt } from "drizzle-orm";
import type { Db } from "@/db";
import { sessions, users, type NewSession } from "@/db/schema";
import type { AuthUser } from "@/lib/auth-types";

export class SessionsRepository {
  constructor(private readonly db: Db) {}

  async findValidUserByToken(token: string): Promise<AuthUser | null> {
    const now = new Date();
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
      .limit(1);

    return rows[0] ?? null;
  }

  async create(
    values: Pick<NewSession, "userId" | "token" | "expiresAt">,
  ): Promise<void> {
    await this.db.insert(sessions).values(values);
  }

  async deleteByToken(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.token, token));
  }
}
