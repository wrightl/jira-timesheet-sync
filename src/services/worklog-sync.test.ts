import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InternalPmClient } from "@/clients/internal-pm";
import { spaceProjectMappings, worklogSyncs } from "@/db/schema";
import {
  acceptWorklogWebhook,
  processWorklogWebhook,
  retryWorklogSync,
} from "@/services/worklog-sync";

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
              return Promise.resolve();
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
      { db: db as never, pmClient: pm },
    );
    expect(result.status).toBe("skipped");
    expect(result.skippedReason).toBe("no_mapping");
    expect(createTimesheet).not.toHaveBeenCalled();
    expect(db._inserts.length).toBe(1);
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
            return { where() { return Promise.resolve(); } };
          },
        };
      },
    };
    const result = await retryWorklogSync("s1", { db: db as never });
    expect(result.error).toBe("retry_not_allowed");
  });

  it("rejects missing payload", async () => {
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
                        status: "failed",
                        rawPayload: null,
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
    };
    const result = await retryWorklogSync("s1", { db: db as never });
    expect(result.error).toBe("missing_raw_payload");
  });
});
