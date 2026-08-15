import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  users,
  userSettings,
  type AppUser,
  type NewAppUser,
} from "@/db/schema";

export type PublicUser = {
  id: string;
  email: string;
  role: AppUser["role"];
  syncEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Columns that exist before migration 0012 (oauth_*). Safe for login. */
const authUserColumns = {
  id: users.id,
  email: users.email,
  passwordHash: users.passwordHash,
  role: users.role,
  mustSetPassword: users.mustSetPassword,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

const publicUserColumns = {
  id: users.id,
  email: users.email,
  role: users.role,
  syncEnabled: sql<boolean>`coalesce(${userSettings.syncEnabled}, false)`.as(
    "sync_enabled",
  ),
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

function asAppUser(row: {
  id: string;
  email: string;
  passwordHash: string;
  role: AppUser["role"];
  mustSetPassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AppUser {
  return {
    ...row,
    oauthProvider: null,
    oauthSubject: null,
  };
}

export class UsersRepository {
  constructor(private readonly db: Db) {}

  /**
   * Auth lookup that avoids selecting oauth_* columns so login still works
   * if migration 0012 has not been applied yet on the deployment database.
   */
  async findByEmail(email: string): Promise<AppUser | null> {
    const rows = await this.db
      .select(authUserColumns)
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const row = rows[0];
    return row ? asAppUser(row) : null;
  }

  async findById(id: string): Promise<AppUser | null> {
    const rows = await this.db
      .select(authUserColumns)
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    const row = rows[0];
    return row ? asAppUser(row) : null;
  }

  async findPublicById(id: string): Promise<PublicUser | null> {
    const rows = await this.db
      .select(publicUserColumns)
      .from(users)
      .leftJoin(userSettings, eq(userSettings.userId, users.id))
      .where(eq(users.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByOAuth(
    provider: string,
    subject: string,
  ): Promise<AppUser | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.oauthProvider, provider),
          eq(users.oauthSubject, subject),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async findIdByEmailLower(email: string): Promise<string | null> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    return rows[0]?.id ?? null;
  }

  async listPublic(): Promise<PublicUser[]> {
    return this.db
      .select(publicUserColumns)
      .from(users)
      .leftJoin(userSettings, eq(userSettings.userId, users.id))
      .orderBy(desc(users.updatedAt));
  }

  async create(values: NewAppUser): Promise<PublicUser> {
    const [row] = await this.db
      .insert(users)
      .values(values)
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });
    await this.ensureUserSettings(row.id);
    return { ...row, syncEnabled: false };
  }

  async createFull(values: NewAppUser): Promise<AppUser> {
    // Prefer returning auth columns only so seed/create still works pre-0012.
    const [row] = await this.db
      .insert(users)
      .values(values)
      .returning(authUserColumns);
    await this.ensureUserSettings(row.id);
    return asAppUser(row);
  }

  async isSyncEnabled(id: string): Promise<boolean | null> {
    const rows = await this.db
      .select({
        id: users.id,
        syncEnabled: userSettings.syncEnabled,
      })
      .from(users)
      .leftJoin(userSettings, eq(userSettings.userId, users.id))
      .where(eq(users.id, id))
      .limit(1);
    if (!rows[0]) return null;
    return rows[0].syncEnabled ?? false;
  }

  async update(
    id: string,
    values: Partial<
      Pick<
        AppUser,
        | "role"
        | "passwordHash"
        | "email"
        | "mustSetPassword"
        | "oauthProvider"
        | "oauthSubject"
      >
    > & {
      updatedAt?: Date;
    },
  ): Promise<PublicUser | null> {
    const [row] = await this.db
      .update(users)
      .set({ updatedAt: new Date(), ...values })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });
    if (!row) return null;
    const settings = await this.db
      .select({ syncEnabled: userSettings.syncEnabled })
      .from(userSettings)
      .where(eq(userSettings.userId, id))
      .limit(1);
    return { ...row, syncEnabled: settings[0]?.syncEnabled ?? false };
  }

  async delete(id: string): Promise<boolean> {
    const [row] = await this.db
      .delete(users)
      .where(eq(users.id, id))
      .returning({ id: users.id });
    return Boolean(row);
  }

  async countAdmins(): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, "admin"));
    return Number(rows[0]?.value ?? 0);
  }

  private async ensureUserSettings(userId: string): Promise<void> {
    await this.db
      .insert(userSettings)
      .values({ userId })
      .onConflictDoNothing();
  }
}
