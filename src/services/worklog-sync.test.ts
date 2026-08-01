import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InternalPmClient } from "@/clients/internal-pm";
import { spaceProjectMappings, worklogSyncs } from "@/db/schema";
import { processWorklogWebhook } from "@/services/worklog-sync";

type Mapping = {
  id: string;
  jiraSpaceId: string;
  jiraSpaceKey: string;
  internalProjectId: string;
  enabled: boolean;
};

type SyncRow = {
  jiraWorklogId: string;
  status: string;
  internalTimesheetId: string | null;
  eventType: string;
  createdAt: Date;
};

function createMockDb(options?: {
  mapping?: Mapping | null;
  priorSyncs?: SyncRow[];
}) {
  const inserts: unknown[] = [];
  const mapping = options?.mapping ?? null;
  const priorSyncs = options?.priorSyncs ?? [];

  const chainFor = (table: unknown) => {
    const isMappings = table === spaceProjectMappings;
    const isSyncs = table === worklogSyncs;

    const limitResult = () => {
      if (isMappings) {
        return Promise.resolve(mapping ? [mapping] : []);
      }
      if (isSyncs) {
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
          return {
            onConflictDoNothing() {
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
      createTimesheet,
      updateTimesheet,
      deleteTimesheet,
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

  it("creates a timesheet when mapped", async () => {
    const db = createMockDb({
      mapping: {
        id: "m1",
        jiraSpaceId: "10000",
        jiraSpaceKey: "ENG",
        internalProjectId: "proj-9",
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
        internalProjectId: "proj-9",
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
        jiraSpaceId: "10000",
        jiraSpaceKey: "ENG",
        internalProjectId: "proj-9",
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
        jiraSpaceId: "10000",
        jiraSpaceKey: "ENG",
        internalProjectId: "proj-9",
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
        jiraSpaceId: "10000",
        jiraSpaceKey: "ENG",
        internalProjectId: "proj-9",
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
});
