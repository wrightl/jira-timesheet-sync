import { describe, expect, it, vi } from "vitest";
import type {
  BitmapApiClient,
  BitmapTimesheetEntry,
  BitmapUser,
} from "@/clients/bitmap-http";
import type { UserMappingsRepository } from "@/repositories/user-mappings-repository";
import type { TeamsRepository } from "@/repositories/teams-repository";
import type { SettingsService } from "@/services/settings-service";
import {
  UtilisationService,
  isCountableTimesheetEntry,
  parseBillableTargetHours,
  utilisationStatus,
} from "@/services/utilisation-service";

const mapping = {
  id: "map-1",
  jiraDisplayName: "Ada Lovelace",
  jiraAccountId: "jira-ada",
  bitmapUserId: "bm-ada",
  bitmapEmail: "ada@example.com",
  jobTitle: "Engineer",
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mappingBob = {
  ...mapping,
  id: "map-2",
  jiraDisplayName: "Bob Builder",
  jiraAccountId: "jira-bob",
  bitmapUserId: "bm-bob",
  bitmapEmail: "bob@example.com",
};

const team = {
  id: "team-1",
  name: "Delivery",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const memberAda = {
  id: "mem-1",
  teamId: "team-1",
  userMappingId: "map-1",
  appUserId: null,
  displayName: "Ada Lovelace",
  weeklyCapacityHours: "40",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const memberBob = {
  id: "mem-2",
  teamId: "team-1",
  userMappingId: "map-2",
  appUserId: null,
  displayName: "Bob Builder",
  weeklyCapacityHours: "40",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const defaultUsers: BitmapUser[] = [
  {
    id: "bm-ada",
    full_name: "Ada Lovelace",
    email: "ada@example.com",
    hours_per_week: 37.5,
    billable_target_hours: 30,
  },
  {
    id: "bm-bob",
    full_name: "Bob Builder",
    email: "bob@example.com",
    hours_per_week: 30,
    billable_target_hours: 24,
  },
];

function makeService(opts: {
  entries?: BitmapTimesheetEntry[];
  users?: BitmapUser[];
  tokenOk?: boolean;
  members?: typeof memberAda[];
  listTimesheetEntries?: ReturnType<typeof vi.fn>;
  listUsers?: ReturnType<typeof vi.fn>;
}) {
  const listTimesheetEntries =
    opts.listTimesheetEntries ??
    vi.fn(async () => opts.entries ?? []);
  const listUsers =
    opts.listUsers ??
    vi.fn(async () => ({
      data: opts.users ?? defaultUsers,
      next_page: null,
      total_pages: 1,
    }));

  const bitmap = {
    listTimesheetEntries,
    listUsers,
  } as unknown as BitmapApiClient;

  const mappings = {
    list: async () => [mapping, mappingBob],
  } as unknown as UserMappingsRepository;

  const teams = {
    listTeams: async () => [team],
    listMembers: async (teamId?: string) => {
      const all = opts.members ?? [memberAda, memberBob];
      if (!teamId) return all;
      return all.filter((m) => m.teamId === teamId);
    },
  } as unknown as TeamsRepository;

  const settings = {
    isTokenConfigured: async () => opts.tokenOk !== false,
    createConfiguredBitmapClient: async () => bitmap,
  } as unknown as SettingsService;

  return {
    service: new UtilisationService(mappings, teams, settings),
    listTimesheetEntries,
    listUsers,
  };
}

describe("utilisation helpers", () => {
  it("excludes planned and rejected entries", () => {
    expect(isCountableTimesheetEntry({ state: "planned", hours: 8 })).toBe(
      false,
    );
    expect(isCountableTimesheetEntry({ state: "rejected", hours: 8 })).toBe(
      false,
    );
    expect(isCountableTimesheetEntry({ state: "completed", hours: 8 })).toBe(
      true,
    );
    expect(isCountableTimesheetEntry({ state: "approved", hours: 8 })).toBe(
      true,
    );
    expect(isCountableTimesheetEntry({ hours: 8 })).toBe(true);
  });

  it("applies billable-target status bands", () => {
    expect(utilisationStatus(40)).toBe("under");
    expect(utilisationStatus(60)).toBe("watch");
    expect(utilisationStatus(80)).toBe("ok");
    expect(utilisationStatus(100)).toBe("ok");
    expect(utilisationStatus(110)).toBe("risk");
  });

  it("parses Bitmap billable_target_hours with fallbacks", () => {
    expect(
      parseBillableTargetHours({
        billable_target_hours: 30,
        hours_per_week: 37.5,
      }),
    ).toBe(30);
    expect(
      parseBillableTargetHours({
        billable_target_hours: null,
        hours_per_week: 37.5,
      }),
    ).toBe(30);
    expect(parseBillableTargetHours({ hours_per_week: 30 })).toBe(24);
    expect(parseBillableTargetHours(null)).toBe(30);
    expect(parseBillableTargetHours(undefined)).toBe(30);
  });
});

describe("UtilisationService", () => {
  it("throws when Bitmap token is missing", async () => {
    const { service } = makeService({ tokenOk: false });
    await expect(service.getUtilisation({ rangeDays: 7 })).rejects.toThrow(
      /Bitmap access token is not configured/,
    );
  });

  it("uses Bitmap billable_target_hours for the utilisation denominator", async () => {
    const { service, listUsers } = makeService({
      entries: [
        {
          user: { id: "bm-ada", full_name: "Ada Lovelace" },
          hours: 18,
          billable: true,
          state: "approved",
          date: "2026-08-10",
        },
        {
          user: { id: "bm-ada", full_name: "Ada Lovelace" },
          hours: 6,
          billable: false,
          state: "approved",
          date: "2026-08-11",
        },
      ],
    });

    const result = await service.getUtilisation({ rangeDays: 7 });
    expect(listUsers).toHaveBeenCalled();
    const ada = result.people.find((p) => p.key === "bm-ada");
    expect(ada).toBeDefined();
    expect(ada!.weeklyBillableTargetHours).toBe(30);
    expect(ada!.billableHours).toBe(18);
    expect(ada!.nonBillableHours).toBe(6);
    expect(ada!.totalHours).toBe(24);
    expect(ada!.targetHours).toBe(30);
    expect(ada!.utilisationPct).toBe(60);
    expect(ada!.status).toBe("watch");
  });

  it("ignores planned and rejected entries", async () => {
    const { service } = makeService({
      entries: [
        {
          user: { id: "bm-ada" },
          hours: 40,
          billable: true,
          state: "planned",
        },
        {
          user: { id: "bm-ada" },
          hours: 16,
          billable: true,
          state: "rejected",
        },
        {
          user: { id: "bm-ada" },
          hours: 6,
          billable: true,
          state: "completed",
        },
      ],
    });

    const result = await service.getUtilisation({ rangeDays: 7 });
    const ada = result.people.find((p) => p.key === "bm-ada");
    expect(ada!.billableHours).toBe(6);
    expect(ada!.utilisationPct).toBe(20);
  });

  it("filters to team members and passes Bitmap user ids", async () => {
    const otherTeamMember = {
      ...memberBob,
      id: "mem-3",
      teamId: "team-2",
    };
    const { service, listTimesheetEntries } = makeService({
      members: [memberAda, otherTeamMember],
      entries: [
        {
          user: { id: "bm-ada" },
          hours: 10,
          billable: true,
          state: "approved",
        },
        {
          user: { id: "bm-bob" },
          hours: 20,
          billable: true,
          state: "approved",
        },
      ],
    });

    const result = await service.getUtilisation({
      rangeDays: 7,
      teamId: "team-1",
    });

    expect(listTimesheetEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ["bm-ada"],
      }),
    );
    expect(result.people.map((p) => p.key)).toEqual(["bm-ada"]);
    expect(result.people[0]!.billableHours).toBe(10);
  });

  it("excludes hours logged against TheCurve", async () => {
    const { service } = makeService({
      entries: [
        {
          user: { id: "bm-ada" },
          hours: 8,
          billable: true,
          state: "approved",
          project: {
            id: "internal",
            client: {
              id: "5e8f8b80d9f37277a88e7f10",
              name: "TheCurve",
            },
          },
        },
        {
          user: { id: "bm-ada" },
          hours: 4,
          billable: true,
          state: "approved",
          project: { id: "client-work", client: { id: "c2", name: "Acme" } },
        },
      ],
    });

    const result = await service.getUtilisation({ rangeDays: 7 });
    const ada = result.people.find((p) => p.key === "bm-ada");
    expect(ada!.billableHours).toBe(4);
  });

  it("includes unmapped Bitmap users using their billable_target_hours", async () => {
    const { service } = makeService({
      members: [memberAda],
      users: [
        ...defaultUsers,
        {
          id: "bm-unknown",
          full_name: "Casey",
          hours_per_week: 30,
          billable_target_hours: 24,
        },
      ],
      entries: [
        {
          user: { id: "bm-unknown", full_name: "Casey" },
          hours: 12,
          billable: true,
          state: "approved",
        },
      ],
    });

    const result = await service.getUtilisation({ rangeDays: 7 });
    const casey = result.people.find((p) => p.key === "bm-unknown");
    expect(casey).toBeDefined();
    expect(casey!.displayName).toBe("Casey");
    expect(casey!.billableHours).toBe(12);
    expect(casey!.weeklyBillableTargetHours).toBe(24);
    expect(casey!.targetHours).toBe(24);
    expect(casey!.utilisationPct).toBe(50);
  });
});
