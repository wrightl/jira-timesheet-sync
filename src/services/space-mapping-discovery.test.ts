import { describe, expect, it } from "vitest";
import type { BitmapApiClient, BitmapProject } from "@/clients/bitmap-http";
import type { SpaceProjectMapping } from "@/db/schema";
import { SpaceMappingDiscoveryService } from "@/services/space-mapping-discovery";
import type { SpaceProjectMappingsRepository } from "@/repositories/space-project-mappings-repository";
import type { SettingsService } from "@/services/settings-service";

function project(partial: Partial<BitmapProject> & { id: string }): BitmapProject {
  return {
    state: "active",
    started: true,
    name: partial.name ?? partial.id,
    ...partial,
  };
}

function createService(options: {
  existing?: SpaceProjectMapping[];
  projects?: BitmapProject[];
}) {
  const store = new Map(
    (options.existing ?? []).map((m) => [m.jiraSpaceKey, m]),
  );
  const created: SpaceProjectMapping[] = [];

  const mappings = {
    findBySpaceKey: async (key: string) => store.get(key) ?? null,
    list: async () => [...store.values()],
    createIfAbsent: async (values: {
      jiraSpaceKey: string;
      clientId: string;
      enabled?: boolean;
    }) => {
      const existing = store.get(values.jiraSpaceKey);
      if (existing) return { mapping: existing, created: false };
      const mapping: SpaceProjectMapping = {
        id: `id-${values.jiraSpaceKey}`,
        jiraSpaceKey: values.jiraSpaceKey,
        clientId: values.clientId,
        enabled: values.enabled ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.set(values.jiraSpaceKey, mapping);
      created.push(mapping);
      return { mapping, created: true };
    },
  } as unknown as SpaceProjectMappingsRepository;

  const api = {
    listProjectsForDiscovery: async () => ({
      data: options.projects ?? [],
      total_pages: 1,
      next_page: null,
    }),
  } as unknown as BitmapApiClient;

  const service = new SpaceMappingDiscoveryService(
    mappings,
    {} as SettingsService,
    async () => api,
  );

  return { service, store, created, api };
}

describe("SpaceMappingDiscoveryService", () => {
  it("ensureMappingForSpaceKey returns existing mapping without scanning", async () => {
    const existing: SpaceProjectMapping = {
      id: "m1",
      jiraSpaceKey: "EPCBC",
      clientId: "client-1",
      enabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { service } = createService({
      existing: [existing],
      projects: [
        project({
          id: "p1",
          jira_budget_jql: "project = EPCBC",
          client: { id: "other-client" },
        }),
      ],
    });

    const result = await service.ensureMappingForSpaceKey("EPCBC");
    expect(result).toEqual(existing);
    expect(result?.enabled).toBe(false);
  });

  it("ensureMappingForSpaceKey creates a mapping from jira_budget_jql", async () => {
    const { service, created } = createService({
      projects: [
        project({
          id: "p1",
          jira_budget_jql:
            'project = EPCBC AND (sprint in openSprints() or sprint in futureSprints())',
          client: { id: "client-epc", client_key: "EPCUK" },
        }),
      ],
    });

    const result = await service.ensureMappingForSpaceKey("EPCBC");
    expect(result).toEqual(
      expect.objectContaining({
        jiraSpaceKey: "EPCBC",
        clientId: "client-epc",
        enabled: true,
      }),
    );
    expect(created).toHaveLength(1);
  });

  it("ensureMappingForSpaceKey returns null when no matching project", async () => {
    const { service, created } = createService({
      projects: [
        project({
          id: "p1",
          jira_budget_jql: "project in (EPCBC, OTHER)",
          client: { id: "client-1" },
        }),
        project({
          id: "p2",
          jira_budget_jql: "",
          client: { id: "client-2" },
        }),
      ],
    });

    expect(await service.ensureMappingForSpaceKey("EPCBC")).toBeNull();
    expect(created).toHaveLength(0);
  });

  it("discoverAndCreateMissing creates only missing keys", async () => {
    const existing: SpaceProjectMapping = {
      id: "m1",
      jiraSpaceKey: "EXIST",
      clientId: "client-old",
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { service } = createService({
      existing: [existing],
      projects: [
        project({
          id: "p1",
          jira_budget_jql: "project = EXIST",
          client: { id: "client-new" },
        }),
        project({
          id: "p2",
          jira_budget_jql: "project = NEWKEY",
          client: { id: "client-2" },
        }),
        project({
          id: "p3",
          jira_budget_jql: "sprint in openSprints()",
          client: { id: "client-3" },
        }),
      ],
    });

    const result = await service.discoverAndCreateMissing();
    expect(result.created).toEqual([
      expect.objectContaining({
        jiraSpaceKey: "NEWKEY",
        clientId: "client-2",
      }),
    ]);
    expect(result.skippedExisting).toBe(1);
    expect(result.skippedUnparseable).toBe(1);
    expect(result.conflicts).toEqual([]);
    expect(existing.clientId).toBe("client-old");
  });

  it("discoverAndCreateMissing skips keys with conflicting client ids", async () => {
    const { service, created } = createService({
      projects: [
        project({
          id: "p1",
          jira_budget_jql: "project = SHARED",
          client: { id: "client-a" },
        }),
        project({
          id: "p2",
          jira_budget_jql: "project = SHARED",
          client: { id: "client-b" },
        }),
      ],
    });

    const result = await service.discoverAndCreateMissing();
    expect(result.created).toEqual([]);
    expect(created).toHaveLength(0);
    expect(result.conflicts).toEqual([
      {
        jiraSpaceKey: "SHARED",
        clientIds: expect.arrayContaining(["client-a", "client-b"]),
      },
    ]);
  });
});
