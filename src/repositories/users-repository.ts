import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  users,
  type AppUser,
  type NewAppUser,
} from "@/db/schema";

export type PublicUser = Pick<
  AppUser,
  "id" | "email" | "role" | "syncEnabled" | "createdAt" | "updatedAt"
>;

/** Columns that exist before migration 0012 (oauth_*). Safe for login. */
const authUserColumns = {
  id: users.id,
  email: users.email,
  passwordHash: users.passwordHash,
  role: users.role,
  mustSetPassword: users.mustSetPassword,
  syncEnabled: users.syncEnabled,
  githubTokenEncrypted: users.githubTokenEncrypted,
  githubOrg: users.githubOrg,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

const publicUserColumns = {
  id: users.id,
  email: users.email,
  role: users.role,
  syncEnabled: users.syncEnabled,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

function asAppUser(row: {
  id: string;
  email: string;
  passwordHash: string;
  role: AppUser["role"];
  mustSetPassword: boolean;
  syncEnabled: boolean;
  githubTokenEncrypted: string | null;
  githubOrg: string | null;
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
      .orderBy(desc(users.updatedAt));
  }

  async create(values: NewAppUser): Promise<PublicUser> {
    const [row] = await this.db
      .insert(users)
      .values(values)
      .returning(publicUserColumns);
    return row;
  }

  async createFull(values: NewAppUser): Promise<AppUser> {
    // Prefer returning auth columns only so seed/create still works pre-0012.
    const [row] = await this.db
      .insert(users)
      .values(values)
      .returning(authUserColumns);
    return asAppUser(row);
  }

  async isSyncEnabled(id: string): Promise<boolean | null> {
    const rows = await this.db
      .select({ syncEnabled: users.syncEnabled })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return rows[0]?.syncEnabled ?? null;
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
        | "syncEnabled"
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
      .returning(publicUserColumns);
    return row ?? null;
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
}
