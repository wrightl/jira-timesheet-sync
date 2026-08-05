import { count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  userMappings,
  type NewUserMapping,
  type UserMapping,
} from "@/db/schema";

export class UserMappingsRepository {
  constructor(private readonly db: Db) {}

  async list(): Promise<UserMapping[]> {
    return this.db
      .select()
      .from(userMappings)
      .orderBy(desc(userMappings.updatedAt));
  }

  async findById(id: string): Promise<UserMapping | null> {
    const rows = await this.db
      .select()
      .from(userMappings)
      .where(eq(userMappings.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByDisplayName(
    jiraDisplayName: string,
  ): Promise<UserMapping | null> {
    const rows = await this.db
      .select()
      .from(userMappings)
      .where(eq(userMappings.jiraDisplayName, jiraDisplayName))
      .limit(1);
    return rows[0] ?? null;
  }

  async findBitmapEmailByDisplayName(
    jiraDisplayName: string,
  ): Promise<string | null> {
    const rows = await this.db
      .select({ bitmapEmail: userMappings.bitmapEmail })
      .from(userMappings)
      .where(eq(userMappings.jiraDisplayName, jiraDisplayName))
      .limit(1);
    return rows[0]?.bitmapEmail ?? null;
  }

  async existsByBitmapEmailLower(email: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: userMappings.id })
      .from(userMappings)
      .where(sql`lower(${userMappings.bitmapEmail}) = ${email}`)
      .limit(1);
    return Boolean(rows[0]);
  }

  async create(
    values: Omit<NewUserMapping, "id" | "createdAt" | "updatedAt">,
  ): Promise<UserMapping> {
    const [row] = await this.db.insert(userMappings).values(values).returning();
    return row;
  }

  async upsertByDisplayName(
    values: Omit<NewUserMapping, "id" | "createdAt" | "updatedAt">,
  ): Promise<UserMapping> {
    const [row] = await this.db
      .insert(userMappings)
      .values(values)
      .onConflictDoUpdate({
        target: userMappings.jiraDisplayName,
        set: {
          jiraAccountId: values.jiraAccountId,
          bitmapUserId: values.bitmapUserId,
          bitmapEmail: values.bitmapEmail,
          jobTitle: values.jobTitle,
          enabled: values.enabled ?? true,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async update(
    id: string,
    values: Partial<
      Pick<
        UserMapping,
        | "jiraDisplayName"
        | "jiraAccountId"
        | "bitmapUserId"
        | "bitmapEmail"
        | "jobTitle"
        | "enabled"
      >
    >,
  ): Promise<UserMapping | null> {
    const [row] = await this.db
      .update(userMappings)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(userMappings.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<UserMapping | null> {
    const [row] = await this.db
      .delete(userMappings)
      .where(eq(userMappings.id, id))
      .returning();
    return row ?? null;
  }

  async countByEnabled(): Promise<{ enabled: boolean; count: number }[]> {
    const rows = await this.db
      .select({
        enabled: userMappings.enabled,
        count: count(),
      })
      .from(userMappings)
      .groupBy(userMappings.enabled);
    return rows.map((r) => ({
      enabled: r.enabled,
      count: Number(r.count),
    }));
  }
}
