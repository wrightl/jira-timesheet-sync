import { count, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import {
  spaceProjectMappings,
  type NewSpaceProjectMapping,
  type SpaceProjectMapping,
} from "@/db/schema";

export class SpaceProjectMappingsRepository {
  constructor(private readonly db: Db) {}

  async list(): Promise<SpaceProjectMapping[]> {
    return this.db
      .select()
      .from(spaceProjectMappings)
      .orderBy(desc(spaceProjectMappings.updatedAt));
  }

  async findById(id: string): Promise<SpaceProjectMapping | null> {
    const rows = await this.db
      .select()
      .from(spaceProjectMappings)
      .where(eq(spaceProjectMappings.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findBySpaceKey(jiraSpaceKey: string): Promise<SpaceProjectMapping | null> {
    const rows = await this.db
      .select()
      .from(spaceProjectMappings)
      .where(eq(spaceProjectMappings.jiraSpaceKey, jiraSpaceKey))
      .limit(1);
    return rows[0] ?? null;
  }

  async listEnabledSpaceKeys(): Promise<string[]> {
    const rows = await this.db
      .select({ jiraSpaceKey: spaceProjectMappings.jiraSpaceKey })
      .from(spaceProjectMappings)
      .where(eq(spaceProjectMappings.enabled, true));
    return rows.map((r) => r.jiraSpaceKey);
  }

  async create(
    values: Omit<NewSpaceProjectMapping, "id" | "createdAt" | "updatedAt">,
  ): Promise<SpaceProjectMapping> {
    const [row] = await this.db
      .insert(spaceProjectMappings)
      .values(values)
      .returning();
    return row;
  }

  /**
   * Insert only when no row exists for jiraSpaceKey.
   * On conflict, returns the existing row without modifying it.
   */
  async createIfAbsent(
    values: Omit<NewSpaceProjectMapping, "id" | "createdAt" | "updatedAt">,
  ): Promise<{ mapping: SpaceProjectMapping; created: boolean }> {
    const [inserted] = await this.db
      .insert(spaceProjectMappings)
      .values(values)
      .onConflictDoNothing({ target: spaceProjectMappings.jiraSpaceKey })
      .returning();

    if (inserted) {
      return { mapping: inserted, created: true };
    }

    const existing = await this.findBySpaceKey(values.jiraSpaceKey);
    if (!existing) {
      throw new Error(
        `space mapping conflict for ${values.jiraSpaceKey} but row not found`,
      );
    }
    return { mapping: existing, created: false };
  }

  async update(
    id: string,
    values: Partial<
      Pick<SpaceProjectMapping, "jiraSpaceKey" | "clientId" | "enabled">
    >,
  ): Promise<SpaceProjectMapping | null> {
    const [row] = await this.db
      .update(spaceProjectMappings)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(spaceProjectMappings.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<SpaceProjectMapping | null> {
    const [row] = await this.db
      .delete(spaceProjectMappings)
      .where(eq(spaceProjectMappings.id, id))
      .returning();
    return row ?? null;
  }

  async countByEnabled(): Promise<{ enabled: boolean; count: number }[]> {
    const rows = await this.db
      .select({
        enabled: spaceProjectMappings.enabled,
        count: count(),
      })
      .from(spaceProjectMappings)
      .groupBy(spaceProjectMappings.enabled);
    return rows.map((r) => ({
      enabled: r.enabled,
      count: Number(r.count),
    }));
  }
}
