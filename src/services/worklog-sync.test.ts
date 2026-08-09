import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InternalPmClient } from "@/clients/internal-pm";
import { spaceProjectMappings, worklogSyncs } from "@/db/schema";
import type { SyncAttributionService } from "@/lib/sync-attribution";
import {
  acceptWorklogWebhook,
  createWorklogSyncService,
  formatTimesheetComment,
  priorStartedFromRawPayload,
  processWorklogWebhook,
  retryWorklogSync,
} from "@/services/worklog-sync";
import type { BitmapResolverService } from "@/services/bitmap-resolver";
import type { SettingsService } from "@/services/settings-service";
import { SpaceProjectMappingsRepository } from "@/repositories/space-project-mappings-repository";
import { WorklogSyncsRepository } from "@/repositories/worklog-syncs-repository";

type Mapping = {
  id: string;
  jiraSpaceKey: string;
  clientId: string;
  enabled: boolean;
};

type SyncRow = {
  id?: string;
  jiraWorklogId: string;
  jiraIssueKey?: string | null;
  jiraSpaceId?: string | null;
  status: string;
  internalTimesheetId: string | null;
  eventType: string;
  payloadHash?: string;
  rawPayload?: string | null;
  error?: string | null;
  createdAt: Date;
};

function createMockDb(options?: {
  mapping?: Mapping | null;
  priorSyncs?: SyncRow[];
  byHash?: SyncRow | null;
  useHashLookup?: boolean;
}) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const mapping = options?.mapping ?? null;
  const priorSyncs = options?.priorSyncs ?? [];
  const byHash = options?.byHash ?? null;
  const useHashLookup = options?.useHashLookup ?? false;

  const chainFor = (table: unknown) => {
    const isMappings = table === spaceProjectMappings;
    const isSyncs = table === worklogSyncs;

    const limitResult = () => {
      if (isMappings) {
        return Promise.resolve(mapping ? [mapping] : []);
      }
      if (isSyncs) {
        if (useHashLookup) {
          return Promise.resolve(byHash ? [byHash] : []);
        }
        return Promise.resolve(priorSyncs);
      }
      return Promise.resolve([]);
    };

    return {
      where() {
        return {
          limit: limitResult,
          orderBy() {
            return { limit: limitResult };
          },
        };
      },
      orderBy() {
        return { limit: limitResult };
      },
      limit: limitResult,
    };
  };

  return {
    _inserts: inserts,
    _updates: updates,
    select() {
      return {
        from(table: unknown) {
          return chainFor(table);
        },
      };
    },
    insert() {
      return {
        values(value: unknown) {
          inserts.push(value);
          const result = {
            returning() {
              const row = value as { status?: string };
              if (row.status === "pending") {
                return Promise.resolve([{ id: "sync-pending-1" }]);
              }
              return Promise.resolve([{ id: "sync-1" }]);
            },
          };
          return {
            onConflictDoNothing() {
              return result;
            },
            returning() {
              return result.returning();
            },
          };
        },
      };
    },
    update() {
      return {
        set(value: unknown) {
          updates.push(value);
          return {
            where() {
              const promise = Promise.resolve([]) as unknown as Promise<
                unknown[]
              > & {
                returning: () => Promise<unknown[]>;
              };
              promise.returning = () => Promise.resolve([]);
              return promise;
            },
          };
        },
      };
    },
  };
}

const basePayload = {
  webhookEvent: "worklog_created",
  worklog: {
    id: "wl-1",
    timeSpentSeconds: 1800,
    started: "2026-08-01T10:00:00.000+0000",
    author: { accountId: "a1", displayName: "Ada" },
  },
  issue: {
    key: "ENG-1",
    fields: { project: { id: "10000", key: "ENG" } },
  },
};

describe("formatTimesheetComment", () => {
  it("formats the issue key alone when there is no comment", () => {
    expect(formatTimesheetComment("ENG-42", null)).toBe("<p>ENG-42:</p>");
  });

  it("appends the comment when present", () => {
    expect(formatTimesheetComment("ENG-42", "Fixed bug")).toBe(
      "<p>ENG-42:</p><ul><li>Fixed bug</li></ul>",
    );
  });

  it("splits line feeds and carriage returns into list items", () => {
    expect(formatTimesheetComment("ENG-42", "Line one\nLine two\r\nLine three\r")).toBe(
      "<p>ENG-42:</p><ul><li>Line one</li><li>Line two</li><li>Line three</li></ul>",
    );
  });

  it("escapes HTML in the issue key and comment", () => {
    expect(formatTimesheetComment("A<B>", 'say "hi" & <bye>')).toBe(
      '<p>A&lt;B&gt;:</p><ul><li>say &quot;hi&quot; &amp; &lt;bye&gt;</li></ul>',
    );
  });
});

describe("acceptWorklogWebhook", () => {
  it("creates a pending sync for a new event", async () => {
    const db = createMockDb({ useHashLookup: true, byHash: null });
    const result = await acceptWorklogWebhook(
      basePayload,
      JSON.stringify(basePayload),
      db as never,
    );
    expect(result.shouldProcess).toBe(true);
    expect(result.syncId).toBe("sync-pending-1");
    expect(db._inserts[0]).toEqual(
      expect.objectContaining({
        status: "pending",
        jiraWorklogId: "wl-1",
        rawPayload: JSON.stringify(basePayload),
        authorAccountId: "a1",
        authorDisplayName: "Ada",
        appUserId: null,
      }),
    );
  });

  it("does not reprocess duplicates", async () => {
    const db = createMockDb({
      useHashLookup: true,
      byHash: {
        id: "existing",
        jiraWorklogId: "wl-1",
        status: "synced",
        internalTimesheetId: "ts-1",
        eventType: "worklog_created",
        createdAt: new Date(),
      },
    });
    const result = await acceptWorklogWebhook(
      basePayload,
      JSON.stringify(basePayload),
      db as never,
    );
    expect(result.shouldProcess).toBe(false);
    expect(result.duplicate).toBe(true);
    expect(result.syncId).toBe("existing");
  });
});

describe("processWorklogWebhook", () => {
  let pm: InternalPmClient;
  let createTimesheet: ReturnType<typeof vi.fn>;
  let updateTimesheet: ReturnType<typeof vi.fn>;
  let deleteTimesheet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createTimesheet = vi.fn(async () => ({ timesheetId: "ts-1" }));
    updateTimesheet = vi.fn(async (id: string) => ({ timesheetId: id }));
    deleteTimesheet = vi.fn(async () => undefined);
    pm = {
      createTimesheet: createTimesheet as InternalPmClient["createTimesheet"],
      updateTimesheet: updateTimesheet as InternalPmClient["updateTimesheet"],
      deleteTimesheet: deleteTimesheet as InternalPmClient["deleteTimesheet"],
    };
  });

  it("skips when there is no space mapping", async () => {
    const db = createMockDb({ mapping: null });
    const result = await processWorklogWebhook(
      basePayload,
      JSON.stringify(basePayload),
      {
        db: db as never,
        pmClient: pm,
        spaceMappingDiscovery: {
          ensureMappingForSpaceKey: async () => null,
        } as never,
      },
    );
    expect(result.status).toBe("skipped");
    expect(result.skippedReason).toBe("no_mapping");
    expect(createTimesheet).not.toHaveBeenCalled();
    expect(db._inserts.length).toBe(1);
  });

  it("auto-creates a space mapping from Bitmap jira_budget_jql when missing", async () => {
    const db = createMockDb({ mapping: null });
    const ensured = {
      id: "auto-m1",
      jiraSpaceKey: "ENG",
      clientId: "client-from-jql",
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await processWorklogWebhook(
      basePayload,
      JSON.stringify(basePayload),
      {
        db: db as never,
        pmClient: pm,
        spaceMappingDiscovery: {
          ensureMappingForSpaceKey: async (key: string) => {
            expect(key).toBe("ENG");
            return ensured;
          },
        } as never,
      },
    );
    expect(result.status).toBe("synced");
    expect(createTimesheet).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-from-jql",
        jiraWorklogId: "wl-1",
      }),
    );
  });

  it("updates an existing pending row when syncId is provided", async () => {
    const db = createMockDb({
      mapping: {
        id: "m1",
        jiraSpaceKey: "ENG",
        clientId: "client-9",
        enabled: true,
      },
    });
    const result = await processWorklogWebhook(
      basePayload,
      JSON.stringify(basePayload),
      { db: db as never, pmClient: pm, syncId: "sync-pending-1" },
    );
    expect(result.status).toBe("synced");
    expect(db._updates.at(-1)).toEqual(
      expect.objectContaining({
        status: "synced",
        internalTimesheetId: "ts-1",
      }),
    );
  });

  it("creates a timesheet when mapped", async () => {
    const db = createMockDb({
      mapping: {
        id: "m1",
        jiraSpaceKey: "ENG",
        clientId: "client-9",
        enabled: true,
      },
    });
    const result = await processWorklogWebhook(
      basePayload,
      JSON.stringify(basePayload),
      { db: db as never, pmClient: pm },
    );
    expect(result.status).toBe("synced");
    expect(result.internalTimesheetId).toBe("ts-1");
    expect(createTimesheet).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-9",
        jiraWorklogId: "wl-1",
        timeSpentSeconds: 1800,
        comment: "<p>ENG-1:</p>",
      }),
    );
  });

  it("re-attributes appUserId after sync when author is provisioned", async () => {
    const db = createMockDb({
      mapping: {
        id: "m1",
        jiraSpaceKey: "ENG",
        clientId: "client-9",
        enabled: true,
      },
    });
    const ensure = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("provisioned-user");
    const attribution = {
      ensureAppUserIdForAuthor: ensure,
      resolveAppUserIdForAuthor: vi.fn(),
      ensureAppUserIdForEmail: vi.fn(),
      isAppUserLinkedViaEmail: vi.fn(),
    } as unknown as SyncAttributionService;

    const service = createWorklogSyncService(db as never, {
      attribution,
      pmClient: pm,
      settings: {
        getAccessToken: async () => "token",
      } as unknown as SettingsService,
      resolver: {
        createResolvingPmClient: () => pm,
      } as unknown as BitmapResolverService,
      syncs: new WorklogSyncsRepository(db as never),
      spaceMappings: new SpaceProjectMappingsRepository(db as never),
    });

    const result = await service.process(
      basePayload,
      JSON.stringify(basePayload),
    );
    expect(result.status).toBe("synced");
    expect(ensure).toHaveBeenCalledTimes(2);
    expect(db._inserts.at(-1) ?? db._updates.at(-1)).toEqual(
      expect.objectContaining({
        status: "synced",
        appUserId: "provisioned-user",
      }),
    );
  });

  it("includes the worklog comment in timesheet notes when present", async () => {
    const payload = {
      ...basePayload,
      worklog: { ...basePayload.worklog, comment: "Pairing session" },
    };
    const db = createMockDb({
      mapping: {
        id: "m1",
        jiraSpaceKey: "ENG",
        clientId: "client-9",
        enabled: true,
      },
    });
    await processWorklogWebhook(payload, JSON.stringify(payload), {
      db: db as never,
      pmClient: pm,
    });
    expect(createTimesheet).toHaveBeenCalledWith(
      expect.objectContaining({
        comment: "<p>ENG-1:</p><ul><li>Pairing session</li></ul>",
      }),
    );
  });

  it("updates using prior timesheet id", async () => {
    const payload = { ...basePayload, webhookEvent: "worklog_updated" };
    const db = createMockDb({
      mapping: {
        id: "m1",
        jiraSpaceKey: "ENG",
        clientId: "client-9",
        enabled: true,
      },
      priorSyncs: [
        {
          jiraWorklogId: "wl-1",
          status: "synced",
          internalTimesheetId: "ts-existing",
          eventType: "worklog_created",
          rawPayload: JSON.stringify(basePayload),
          createdAt: new Date(),
        },
      ],
    });
    const result = await processWorklogWebhook(
      payload,
      JSON.stringify(payload),
      { db: db as never, pmClient: pm },
    );
    expect(result.status).toBe("synced");
    expect(updateTimesheet).toHaveBeenCalledWith(
      "ts-existing",
      expect.objectContaining({ jiraWorklogId: "wl-1" }),
    );
    expect(deleteTimesheet).not.toHaveBeenCalled();
    expect(createTimesheet).not.toHaveBeenCalled();
  });

  it("deletes and recreates when worklog date changes", async () => {
    createTimesheet = vi.fn(async () => ({ timesheetId: "ts-new" }));
    pm = {
      createTimesheet: createTimesheet as InternalPmClient["createTimesheet"],
      updateTimesheet: updateTimesheet as InternalPmClient["updateTimesheet"],
      deleteTimesheet: deleteTimesheet as InternalPmClient["deleteTimesheet"],
    };

    const priorPayload = {
      ...basePayload,
      worklog: {
        ...basePayload.worklog,
        started: "2026-08-01T10:00:00.000+0000",
      },
    };
    const payload = {
      ...basePayload,
      webhookEvent: "worklog_updated",
      worklog: {
        ...basePayload.worklog,
        started: "2026-08-03T14:00:00.000+0000",
      },
    };
    const db = createMockDb({
      mapping: {
        id: "m1",
        jiraSpaceKey: "ENG",
        clientId: "client-9",
        enabled: true,
      },
      priorSyncs: [
        {
          jiraWorklogId: "wl-1",
          status: "synced",
          internalTimesheetId: "ts-existing",
          eventType: "worklog_created",
          rawPayload: JSON.stringify(priorPayload),
          createdAt: new Date(),
        },
      ],
    });
    const result = await processWorklogWebhook(
      payload,
      JSON.stringify(payload),
      { db: db as never, pmClient: pm },
    );
    expect(result.status).toBe("synced");
    expect(result.internalTimesheetId).toBe("ts-new");
    expect(deleteTimesheet).toHaveBeenCalledWith("ts-existing");
    expect(createTimesheet).toHaveBeenCalledWith(
      expect.objectContaining({
        jiraWorklogId: "wl-1",
        started: "2026-08-03T14:00:00.000+0000",
      }),
    );
    expect(updateTimesheet).not.toHaveBeenCalled();
  });

  it("updates in place when prior date cannot be determined", async () => {
    const payload = { ...basePayload, webhookEvent: "worklog_updated" };
    const db = createMockDb({
      mapping: {
        id: "m1",
        jiraSpaceKey: "ENG",
        clientId: "client-9",
        enabled: true,
      },
      priorSyncs: [
        {
          jiraWorklogId: "wl-1",
          status: "synced",
          internalTimesheetId: "ts-existing",
          eventType: "worklog_created",
          rawPayload: null,
          createdAt: new Date(),
        },
      ],
    });
    const result = await processWorklogWebhook(
      payload,
      JSON.stringify(payload),
      { db: db as never, pmClient: pm },
    );
    expect(result.status).toBe("synced");
    expect(updateTimesheet).toHaveBeenCalledWith(
      "ts-existing",
      expect.objectContaining({ jiraWorklogId: "wl-1" }),
    );
    expect(deleteTimesheet).not.toHaveBeenCalled();
  });

  it("deletes using prior timesheet id", async () => {
    const payload = { ...basePayload, webhookEvent: "worklog_deleted" };
    const db = createMockDb({
      mapping: {
        id: "m1",
        jiraSpaceKey: "ENG",
        clientId: "client-9",
        enabled: true,
      },
      priorSyncs: [
        {
          jiraWorklogId: "wl-1",
          status: "synced",
          internalTimesheetId: "ts-existing",
          eventType: "worklog_created",
          createdAt: new Date(),
        },
      ],
    });
    const result = await processWorklogWebhook(
      payload,
      JSON.stringify(payload),
      { db: db as never, pmClient: pm },
    );
    expect(result.status).toBe("synced");
    expect(deleteTimesheet).toHaveBeenCalledWith("ts-existing");
  });

  it("skips when mapping is disabled", async () => {
    const db = createMockDb({
      mapping: {
        id: "m1",
        jiraSpaceKey: "ENG",
        clientId: "client-9",
        enabled: false,
      },
    });
    const result = await processWorklogWebhook(
      basePayload,
      JSON.stringify(basePayload),
      { db: db as never, pmClient: pm },
    );
    expect(result.status).toBe("skipped");
    expect(result.skippedReason).toBe("mapping_disabled");
    expect(createTimesheet).not.toHaveBeenCalled();
  });

  it("skips when the attributed app user has sync disabled", async () => {
    const db = createMockDb({
      mapping: {
        id: "m1",
        jiraSpaceKey: "ENG",
        clientId: "client-9",
        enabled: true,
      },
    });
    const attribution = {
      ensureAppUserIdForAuthor: vi.fn().mockResolvedValue("user-1"),
      resolveAppUserIdForAuthor: vi.fn(),
      ensureAppUserIdForEmail: vi.fn(),
      isAppUserLinkedViaEmail: vi.fn(),
    } as unknown as SyncAttributionService;

    const service = createWorklogSyncService(db as never, {
      attribution,
      pmClient: pm,
      users: {
        isSyncEnabled: vi.fn().mockResolvedValue(false),
      } as never,
      settings: {
        getAccessToken: async () => "token",
      } as unknown as SettingsService,
      resolver: {
        createResolvingPmClient: () => pm,
      } as unknown as BitmapResolverService,
      syncs: new WorklogSyncsRepository(db as never),
      spaceMappings: new SpaceProjectMappingsRepository(db as never),
    });

    const result = await service.process(
      basePayload,
      JSON.stringify(basePayload),
    );
    expect(result.status).toBe("skipped");
    expect(result.skippedReason).toBe("user_sync_disabled");
    expect(createTimesheet).not.toHaveBeenCalled();
  });

  it("records failure when the PM client rejects resolution", async () => {
    createTimesheet.mockRejectedValueOnce(new Error("No Bitmap user found"));
    const db = createMockDb({
      mapping: {
        id: "m1",
        jiraSpaceKey: "ENG",
        clientId: "client-9",
        enabled: true,
      },
    });
    const result = await processWorklogWebhook(
      basePayload,
      JSON.stringify(basePayload),
      { db: db as never, pmClient: pm },
    );
    expect(result.status).toBe("failed");
    expect(result.error).toBe("No Bitmap user found");
    expect(db._inserts.at(-1)).toEqual(
      expect.objectContaining({
        status: "failed",
        error: "No Bitmap user found",
      }),
    );
  });
});

describe("retryWorklogSync", () => {
  it("rejects synced rows", async () => {
    const db = {
      select() {
        return {
          from() {
            return {
              where() {
                return {
                  limit() {
                    return Promise.resolve([
                      {
                        id: "s1",
                        status: "synced",
                        rawPayload: JSON.stringify(basePayload),
                        eventType: "worklog_created",
                        jiraWorklogId: "wl-1",
                      },
                    ]);
                  },
                };
              },
            };
          },
        };
      },
      update() {
        return {
          set() {
            return {
              where() {
                const promise = Promise.resolve([]) as unknown as Promise<
                  unknown[]
                > & {
                  returning: () => Promise<unknown[]>;
                };
                // CAS claim fails for synced rows
                promise.returning = () => Promise.resolve([]);
                return promise;
              },
            };
          },
        };
      },
    };
    const result = await retryWorklogSync("s1", { db: db as never });
    expect(result.error).toBe("retry_not_allowed");
  });

  it("rejects missing payload", async () => {
    const claimed = {
      id: "s1",
      status: "pending",
      rawPayload: null,
      eventType: "worklog_created" as const,
      jiraWorklogId: "wl-1",
      jiraIssueKey: null,
      jiraSpaceId: null,
      internalTimesheetId: null,
      payloadHash: "hash",
      authorAccountId: null,
      authorDisplayName: null,
      appUserId: null,
    };
    const db = {
      select() {
        return {
          from() {
            return {
              where() {
                return {
                  limit() {
                    return Promise.resolve([claimed]);
                  },
                };
              },
            };
          },
        };
      },
      update() {
        return {
          set() {
            return {
              where() {
                const promise = Promise.resolve([
                  claimed,
                ]) as unknown as Promise<unknown[]> & {
                  returning: () => Promise<unknown[]>;
                };
                promise.returning = () => Promise.resolve([claimed]);
                return promise;
              },
            };
          },
        };
      },
      insert() {
        return {
          values() {
            return {
              onConflictDoNothing() {
                return {
                  returning() {
                    return Promise.resolve([]);
                  },
                };
              },
            };
          },
        };
      },
    };
    const result = await retryWorklogSync("s1", { db: db as never });
    expect(result.error).toBe("missing_raw_payload");
  });
});
