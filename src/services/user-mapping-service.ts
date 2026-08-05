import { getDb, type Db } from "@/db";
import type { UserMapping } from "@/db/schema";
import { UserMappingsRepository } from "@/repositories/user-mappings-repository";
import type {
  UserMappingCreateInput,
  UserMappingUpdateInput,
} from "@/lib/validators";

export class UserMappingService {
  constructor(private readonly mappings: UserMappingsRepository) {}

  list(): Promise<UserMapping[]> {
    return this.mappings.list();
  }

  findByDisplayName(name: string): Promise<UserMapping | null> {
    return this.mappings.findByDisplayName(name);
  }

  upsertByDisplayName(
    values: Parameters<UserMappingsRepository["upsertByDisplayName"]>[0],
  ): Promise<UserMapping> {
    return this.mappings.upsertByDisplayName(values);
  }

  async create(
    input: UserMappingCreateInput,
  ): Promise<{ mapping: UserMapping } | { error: "conflict" }> {
    try {
      const mapping = await this.mappings.create({
        jiraDisplayName: input.jiraDisplayName,
        jiraAccountId: input.jiraAccountId ?? null,
        bitmapUserId: input.bitmapUserId,
        bitmapEmail: input.bitmapEmail ?? null,
        jobTitle: input.jobTitle ?? null,
        enabled: input.enabled,
      });
      return { mapping };
    } catch {
      return { error: "conflict" };
    }
  }

  async update(
    id: string,
    input: UserMappingUpdateInput,
  ): Promise<{ mapping: UserMapping } | { error: "not_found" }> {
    const mapping = await this.mappings.update(id, input);
    if (!mapping) return { error: "not_found" };
    return { mapping };
  }

  async delete(
    id: string,
  ): Promise<{ ok: true } | { error: "not_found" }> {
    const row = await this.mappings.delete(id);
    if (!row) return { error: "not_found" };
    return { ok: true };
  }
}

export function createUserMappingService(db: Db = getDb()) {
  return new UserMappingService(new UserMappingsRepository(db));
}
