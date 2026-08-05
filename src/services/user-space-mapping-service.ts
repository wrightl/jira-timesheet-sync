import { getDb, type Db } from "@/db";
import type { UserSpaceMapping } from "@/db/schema";
import { UserSpaceMappingsRepository } from "@/repositories/user-space-mappings-repository";
import type {
  UserSpaceMappingCreateInput,
  UserSpaceMappingUpdateInput,
} from "@/lib/validators";

export class UserSpaceMappingService {
  constructor(private readonly mappings: UserSpaceMappingsRepository) {}

  listForViewer(options: {
    viewerId: string;
    viewerRole: "admin" | "user";
    filterUserId?: string | null;
    all?: boolean;
  }): Promise<UserSpaceMapping[]> {
    if (options.viewerRole === "admin" && options.filterUserId) {
      return this.mappings.listByUserId(options.filterUserId);
    }
    if (options.viewerRole === "admin" && options.all) {
      return this.mappings.listAll();
    }
    return this.mappings.listByUserId(options.viewerId);
  }

  findById(id: string): Promise<UserSpaceMapping | null> {
    return this.mappings.findById(id);
  }

  findEnabledByUserAndSpace(
    userId: string,
    jiraSpaceKey: string,
  ): Promise<UserSpaceMapping | null> {
    return this.mappings.findEnabledByUserAndSpace(userId, jiraSpaceKey);
  }

  async create(
    targetUserId: string,
    input: UserSpaceMappingCreateInput,
  ): Promise<{ mapping: UserSpaceMapping } | { error: "conflict" }> {
    try {
      const mapping = await this.mappings.create({
        userId: targetUserId,
        jiraSpaceKey: input.jiraSpaceKey,
        clientId: input.clientId,
        projectId: input.projectId,
        projectBudgetId: input.projectBudgetId,
        projectName: input.projectName ?? null,
        budgetName: input.budgetName ?? null,
        enabled: input.enabled,
      });
      return { mapping };
    } catch {
      return { error: "conflict" };
    }
  }

  async update(
    id: string,
    input: UserSpaceMappingUpdateInput,
    actor: { id: string; role: "admin" | "user" },
  ): Promise<
    | { mapping: UserSpaceMapping }
    | { error: "not_found" | "forbidden" }
  > {
    const existing = await this.mappings.findById(id);
    if (!existing) return { error: "not_found" };
    if (existing.userId !== actor.id && actor.role !== "admin") {
      return { error: "forbidden" };
    }
    const mapping = await this.mappings.update(id, input);
    if (!mapping) return { error: "not_found" };
    return { mapping };
  }

  async delete(
    id: string,
    actor: { id: string; role: "admin" | "user" },
  ): Promise<{ ok: true } | { error: "not_found" | "forbidden" }> {
    const existing = await this.mappings.findById(id);
    if (!existing) return { error: "not_found" };
    if (existing.userId !== actor.id && actor.role !== "admin") {
      return { error: "forbidden" };
    }
    await this.mappings.delete(id);
    return { ok: true };
  }
}

export function createUserSpaceMappingService(db: Db = getDb()) {
  return new UserSpaceMappingService(new UserSpaceMappingsRepository(db));
}
