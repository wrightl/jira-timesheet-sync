import { getDb, type Db } from "@/db";
import type { SpaceProjectMapping } from "@/db/schema";
import { SpaceProjectMappingsRepository } from "@/repositories/space-project-mappings-repository";
import type {
  MappingCreateInput,
  MappingUpdateInput,
} from "@/lib/validators";

export class SpaceMappingService {
  constructor(private readonly mappings: SpaceProjectMappingsRepository) {}

  list(): Promise<SpaceProjectMapping[]> {
    return this.mappings.list();
  }

  findBySpaceKey(jiraSpaceKey: string): Promise<SpaceProjectMapping | null> {
    return this.mappings.findBySpaceKey(jiraSpaceKey);
  }

  async create(
    input: MappingCreateInput,
  ): Promise<{ mapping: SpaceProjectMapping } | { error: "conflict" }> {
    try {
      const mapping = await this.mappings.create({
        jiraSpaceKey: input.jiraSpaceKey,
        clientId: input.clientId,
        enabled: input.enabled,
      });
      return { mapping };
    } catch {
      return { error: "conflict" };
    }
  }

  async update(
    id: string,
    input: MappingUpdateInput,
  ): Promise<{ mapping: SpaceProjectMapping } | { error: "not_found" }> {
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

export function createSpaceMappingService(db: Db = getDb()) {
  return new SpaceMappingService(new SpaceProjectMappingsRepository(db));
}
