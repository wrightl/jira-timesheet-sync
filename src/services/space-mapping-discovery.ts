import { getDb, type Db } from "@/db";
import type { BitmapApiClient, BitmapProject } from "@/clients/bitmap-http";
import type { SpaceProjectMapping } from "@/db/schema";
import { extractJiraSpaceKeyFromBudgetJql } from "@/lib/jira-budget-jql";
import { isExcludedClient } from "@/lib/excluded-clients";
import { log } from "@/lib/log";
import { SpaceProjectMappingsRepository } from "@/repositories/space-project-mappings-repository";
import {
  createSettingsService,
  type SettingsService,
} from "@/services/settings-service";

export type SpaceMappingConflict = {
  jiraSpaceKey: string;
  clientIds: string[];
};

export type DiscoverResult = {
  created: SpaceProjectMapping[];
  skippedExisting: number;
  skippedUnparseable: number;
  conflicts: SpaceMappingConflict[];
};

export class SpaceMappingDiscoveryService {
  constructor(
    private readonly mappings: SpaceProjectMappingsRepository,
    private readonly settings: SettingsService,
    private readonly createApi?: () => Promise<BitmapApiClient>,
  ) {}

  private async apiClient(): Promise<BitmapApiClient> {
    if (this.createApi) return this.createApi();
    return this.settings.createConfiguredBitmapClient();
  }

  async listDiscoveryProjects(
    api?: BitmapApiClient,
  ): Promise<BitmapProject[]> {
    const client = api ?? (await this.apiClient());
    const projects: BitmapProject[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const response = await client.listProjectsForDiscovery({
        status: "active",
        page,
      });
      projects.push(...(response.data ?? []));
      totalPages = Math.max(1, response.total_pages ?? 1);
      if (!response.next_page && page >= totalPages) break;
      page = response.next_page ?? page + 1;
      if (page > totalPages) break;
    }

    return projects.filter((project) => !isExcludedClient(project.client));
  }

  /**
   * Find or create a space → client mapping for the given Jira space key
   * by scanning Bitmap projects' jira_budget_jql.
   * Existing rows (enabled or disabled) are returned unchanged.
   */
  async ensureMappingForSpaceKey(
    spaceKey: string,
    api?: BitmapApiClient,
  ): Promise<SpaceProjectMapping | null> {
    const existing = await this.mappings.findBySpaceKey(spaceKey);
    if (existing) return existing;

    const projects = await this.listDiscoveryProjects(api);
    for (const project of projects) {
      const key = extractJiraSpaceKeyFromBudgetJql(project.jira_budget_jql);
      if (key !== spaceKey) continue;
      const clientId = project.client?.id;
      if (!clientId) continue;

      const { mapping, created } = await this.mappings.createIfAbsent({
        jiraSpaceKey: spaceKey,
        clientId,
        enabled: true,
      });

      if (created) {
        log.info("space-mapping-discovery", "space_mapping_auto_created", {
          jiraSpaceKey: spaceKey,
          clientId,
          bitmapProjectId: project.id,
        });
      }
      return mapping;
    }

    return null;
  }

  async discoverAndCreateMissing(
    api?: BitmapApiClient,
  ): Promise<DiscoverResult> {
    const projects = await this.listDiscoveryProjects(api);
    const keyToClient = new Map<string, string>();
    const conflicts = new Map<string, Set<string>>();
    let skippedUnparseable = 0;

    for (const project of projects) {
      const key = extractJiraSpaceKeyFromBudgetJql(project.jira_budget_jql);
      const clientId = project.client?.id;
      if (!key || !clientId) {
        if (project.jira_budget_jql?.trim()) {
          skippedUnparseable += 1;
        }
        continue;
      }

      const conflictSet = conflicts.get(key);
      if (conflictSet) {
        conflictSet.add(clientId);
        continue;
      }

      const existingClient = keyToClient.get(key);
      if (existingClient && existingClient !== clientId) {
        conflicts.set(key, new Set([existingClient, clientId]));
        keyToClient.delete(key);
        log.warn("space-mapping-discovery", "conflicting_client_ids", {
          jiraSpaceKey: key,
          clientIds: [existingClient, clientId],
        });
        continue;
      }

      if (!existingClient) {
        keyToClient.set(key, clientId);
      }
    }

    const existing = await this.mappings.list();
    const existingKeys = new Set(existing.map((m) => m.jiraSpaceKey));

    const created: SpaceProjectMapping[] = [];
    let skippedExisting = 0;

    for (const [jiraSpaceKey, clientId] of keyToClient) {
      if (existingKeys.has(jiraSpaceKey)) {
        skippedExisting += 1;
        continue;
      }

      const result = await this.mappings.createIfAbsent({
        jiraSpaceKey,
        clientId,
        enabled: true,
      });
      if (result.created) {
        created.push(result.mapping);
        log.info("space-mapping-discovery", "space_mapping_discovered", {
          jiraSpaceKey,
          clientId,
        });
      } else {
        skippedExisting += 1;
      }
    }

    return {
      created,
      skippedExisting,
      skippedUnparseable,
      conflicts: [...conflicts.entries()].map(([jiraSpaceKey, ids]) => ({
        jiraSpaceKey,
        clientIds: [...ids],
      })),
    };
  }
}

export function createSpaceMappingDiscoveryService(
  db: Db = getDb(),
  options?: {
    createApi?: () => Promise<BitmapApiClient>;
  },
) {
  return new SpaceMappingDiscoveryService(
    new SpaceProjectMappingsRepository(db),
    createSettingsService(db),
    options?.createApi,
  );
}
