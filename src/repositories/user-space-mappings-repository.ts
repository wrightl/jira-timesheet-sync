import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  userSpaceMappings,
  type NewUserSpaceMapping,
  type UserSpaceMapping,
} from "@/db/schema";
import { isExcludedClientId } from "@/lib/excluded-clients";

export class UserSpaceMappingsRepository {
  constructor(private readonly db: Db) {}

  async listAll(): Promise<UserSpaceMapping[]> {
    return this.db
      .select()
      .from(userSpaceMappings)
      .orderBy(desc(userSpaceMappings.updatedAt));
  }

  async listByUserId(userId: string): Promise<UserSpaceMapping[]> {
    return this.db
      .select()
      .from(userSpaceMappings)
      .where(eq(userSpaceMappings.userId, userId))
      .orderBy(desc(userSpaceMappings.updatedAt));
  }

  async findById(id: string): Promise<UserSpaceMapping | null> {
    const rows = await this.db
      .select()
      .from(userSpaceMappings)
      .where(eq(userSpaceMappings.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findEnabledByUserAndSpace(
    userId: string,
    jiraSpaceKey: string,
  ): Promise<UserSpaceMapping | null> {
    const rows = await this.db
      .select()
      .from(userSpaceMappings)
      .where(
        and(
          eq(userSpaceMappings.userId, userId),
          eq(userSpaceMappings.jiraSpaceKey, jiraSpaceKey),
          eq(userSpaceMappings.enabled, true),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async listEnabledSpaceKeysForUser(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({
        jiraSpaceKey: userSpaceMappings.jiraSpaceKey,
        clientId: userSpaceMappings.clientId,
      })
      .from(userSpaceMappings)
      .where(
        and(
          eq(userSpaceMappings.userId, userId),
          eq(userSpaceMappings.enabled, true),
        ),
      );
    return rows
      .filter((r) => !isExcludedClientId(r.clientId))
      .map((r) => r.jiraSpaceKey);
  }

  async create(
    values: Omit<NewUserSpaceMapping, "id" | "createdAt" | "updatedAt">,
  ): Promise<UserSpaceMapping> {
    const [row] = await this.db
      .insert(userSpaceMappings)
      .values(values)
      .returning();
    return row;
  }

  async update(
    id: string,
    values: Partial<
      Pick<
        UserSpaceMapping,
        | "jiraSpaceKey"
        | "clientId"
        | "projectId"
        | "projectBudgetId"
        | "projectName"
        | "budgetName"
        | "enabled"
      >
    >,
  ): Promise<UserSpaceMapping | null> {
    const [row] = await this.db
      .update(userSpaceMappings)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(userSpaceMappings.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const [row] = await this.db
      .delete(userSpaceMappings)
      .where(eq(userSpaceMappings.id, id))
      .returning({ id: userSpaceMappings.id });
    return Boolean(row);
  }

  async countByEnabledForUser(
    userId: string,
  ): Promise<{ enabled: boolean; count: number }[]> {
    const rows = await this.db
      .select({
        enabled: userSpaceMappings.enabled,
        count: count(),
      })
      .from(userSpaceMappings)
      .where(eq(userSpaceMappings.userId, userId))
      .groupBy(userSpaceMappings.enabled);
    return rows.map((r) => ({
      enabled: r.enabled,
      count: Number(r.count),
    }));
  }

  async countDistinctUsers(): Promise<number> {
    const rows = await this.db
      .select({
        value: sql<number>`count(distinct ${userSpaceMappings.userId})`,
      })
      .from(userSpaceMappings);
    return Number(rows[0]?.value ?? 0);
  }
}
