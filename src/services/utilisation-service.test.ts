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
  UtilisationPersonNotFoundError,
  UtilisationService,
  aggregateNonBillable,
  aggregateProjectBreakdown,
  buildCumulativeUtilisationSeries,
  hoursToTarget,
  isCountableTimesheetEntry,
  NO_NONBILLABLE_REASON_LABEL,
  parseWeeklyWorkingHours,
  selectCurrentWorkingDuration,
  TARGET_BILLABLE_UTILISATION_PCT,
  targetBillableHours,
  timesheetBillableFlag,
  UNKNOWN_PROJECT_LABEL,
  utcDateRange,
  utilisationStatus,
  workingHoursForRange,
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

  it("treats only explicit false as non-billable", () => {
    expect(timesheetBillableFlag(false)).toBe(false);
    expect(timesheetBillableFlag("false")).toBe(false);
    expect(timesheetBillableFlag(0)).toBe(false);
    expect(timesheetBillableFlag(true)).toBe(true);
    expect(timesheetBillableFlag("true")).toBe(true);
    expect(timesheetBillableFlag(undefined)).toBeNull();
    expect(timesheetBillableFlag(null)).toBeNull();
  });

  it("applies billable-target status bands", () => {
    expect(utilisationStatus(40)).toBe("under");
    expect(utilisationStatus(60)).toBe("watch");
    expect(utilisationStatus(80)).toBe("ok");
    expect(utilisationStatus(100)).toBe("ok");
    expect(utilisationStatus(110)).toBe("risk");
  });

  it("parses weekly hours from the latest effective working duration", () => {
    const asOf = Date.parse("2026-08-15T12:00:00Z");
    expect(
      parseWeeklyWorkingHours(
        {
          hours_per_week: 37.5,
          user_working_durations: [
            { effective_from: "2020-01-01", hours_per_week: 37.5 },
            { effective_from: "2026-03-01", hours_per_week: 22.5 },
            { effective_from: "2027-01-01", hours_per_week: 0 },
          ],
        },
        asOf,
      ),
    ).toBe(22.5);
    expect(
      selectCurrentWorkingDuration(
        [
          { effective_from: "2020-01-01", hours_per_week: 37.5 },
          { effective_from: "2026-03-01", hours_per_week: 22.5 },
        ],
        asOf,
      )?.hours_per_week,
    ).toBe(22.5);
    expect(parseWeeklyWorkingHours({ hours_per_week: 30 }, asOf)).toBe(30);
    expect(parseWeeklyWorkingHours({ hours_per_week: null }, asOf)).toBe(37.5);
    expect(parseWeeklyWorkingHours(null, asOf)).toBe(37.5);
    const tuesday = new Date("2026-08-25T15:00:00.000Z");
    expect(workingHoursForRange(37.5, 7, tuesday)).toBe(37.5);
    expect(workingHoursForRange(37.5, 1, tuesday)).toBe(7.5);
    expect(
      workingHoursForRange(37.5, 1, new Date("2026-08-23T15:00:00.000Z")),
    ).toBe(0);
  });

  it("computes hours still needed to hit the billable target", () => {
    expect(TARGET_BILLABLE_UTILISATION_PCT).toBe(80);
    expect(targetBillableHours(37.5)).toBe(30);
    expect(hoursToTarget(18, 37.5)).toBe(12);
    expect(hoursToTarget(30, 37.5)).toBe(0);
    expect(hoursToTarget(36, 37.5)).toBe(-6);
    expect(hoursToTarget(10, 0)).toBeNull();
  });

  it("builds a UTC weekday date range ending today", () => {
    expect(utcDateRange(new Date("2026-08-25T15:00:00.000Z"), 3)).toEqual([
      "2026-08-24",
      "2026-08-25",
    ]);
  });

  it("builds cumulative utilisation series with a team average", () => {
    const dailyAda = new Map<string, number>([
      ["2026-08-24", 6],
      ["2026-08-25", 6],
    ]);
    const dailyBob = new Map<string, number>([["2026-08-25", 3]]);
    const result = buildCumulativeUtilisationSeries({
      dates: ["2026-08-24", "2026-08-25"],
      people: [
        {
          key: "ada",
          displayName: "Ada",
          weeklyWorkingHours: 37.5,
          dailyBillableHours: dailyAda,
        },
        {
          key: "bob",
          displayName: "Bob",
          weeklyWorkingHours: 37.5,
          dailyBillableHours: dailyBob,
        },
      ],
    });

    expect(result.personSeries).toHaveLength(2);
    const adaDay2 = result.personSeries[0]!.points[1];
    expect(adaDay2?.billableHours).toBe(12);
    expect(adaDay2?.workingHours).toBe(15);
    expect(result.series[1]?.billableHours).toBe(15);
    expect(result.series[1]?.utilisationPct).toBe(50);
  });

  it("ignores Saturday and Sunday dates in cumulative series", () => {
    const result = buildCumulativeUtilisationSeries({
      dates: ["2026-08-21", "2026-08-22", "2026-08-24"],
      people: [
        {
          key: "ada",
          displayName: "Ada",
          weeklyWorkingHours: 37.5,
          dailyBillableHours: new Map([
            ["2026-08-21", 6],
            ["2026-08-22", 8],
            ["2026-08-24", 6],
          ]),
        },
      ],
    });
    expect(result.series.map((point) => point.date)).toEqual([
      "2026-08-21",
      "2026-08-24",
    ]);
    expect(result.series[1]?.billableHours).toBe(12);
  });

  it("aggregates project mix and non-billable reasons", () => {
    const entries: BitmapTimesheetEntry[] = [
      {
        hours: 8,
        billable: true,
        state: "approved",
        project: { id: "p1", name: "Client App", client: { id: "c1", name: "Acme" } },
      },
      {
        hours: 3,
        billable: false,
        nonbillable_reason: "Internal tooling",
        state: "approved",
        project: { id: "p2", name: "Platform", client: { id: "c2", name: "Internal" } },
      },
      {
        hours: 2,
        billable: false,
        state: "approved",
        project: { id: "p2", name: "Platform", client: { id: "c2", name: "Internal" } },
      },
      {
        hours: 4,
        billable: true,
        state: "planned",
        project: { id: "p1", name: "Client App" },
      },
      {
        hours: 10,
        billable: true,
        state: "approved",
        date: "2026-08-22",
        project: { id: "p1", name: "Client App", client: { id: "c1", name: "Acme" } },
      },
    ];

    const projects = aggregateProjectBreakdown(entries);
    expect(projects.map((p) => p.projectName)).toEqual(["Client App", "Platform"]);
    expect(projects[0]).toMatchObject({
      billableHours: 8,
      nonBillableHours: 0,
      totalHours: 8,
      pctOfTotal: 61.5,
    });
    expect(projects[1]).toMatchObject({
      billableHours: 0,
      nonBillableHours: 5,
      totalHours: 5,
      pctOfTotal: 38.5,
    });

    const nonBillable = aggregateNonBillable(entries);
    expect(nonBillable.byReason).toEqual([
      {
        reason: "Internal tooling",
        hours: 3,
        pctOfNonBillable: 60,
      },
      {
        reason: NO_NONBILLABLE_REASON_LABEL,
        hours: 2,
        pctOfNonBillable: 40,
      },
    ]);
    expect(nonBillable.byProject[0]).toMatchObject({
      projectName: "Platform",
      hours: 5,
      pctOfNonBillable: 100,
    });
    expect(UNKNOWN_PROJECT_LABEL).toBe("Unknown project");
  });
});

describe("UtilisationService", () => {
  it("throws when Bitmap token is missing", async () => {
    const { service } = makeService({ tokenOk: false });
    await expect(service.getUtilisation({ rangeDays: 7 })).rejects.toThrow(
      /Bitmap access token is not configured/,
    );
  });

  it("uses contracted working hours for the utilisation denominator", async () => {
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
    expect(result.users.map((u) => u.id).sort()).toEqual(["bm-ada", "bm-bob"]);
    const ada = result.people.find((p) => p.key === "bm-ada");
    expect(ada).toBeDefined();
    expect(ada!.weeklyWorkingHours).toBe(37.5);
    expect(ada!.billableHours).toBe(18);
    expect(ada!.nonBillableHours).toBe(6);
    expect(ada!.totalHours).toBe(24);
    expect(ada!.workingHours).toBe(37.5);
    expect(ada!.utilisationPct).toBe(48);
    expect(ada!.status).toBe("under");
  });

  it("uses hours_per_week from the latest user_working_durations row", async () => {
    const { service } = makeService({
      users: [
        {
          id: "bm-ada",
          full_name: "Ada Lovelace",
          email: "ada@example.com",
          hours_per_week: 37.5,
          user_working_durations: [
            { effective_from: "2019-01-01", hours_per_week: 37.5 },
            { effective_from: "2024-06-01", hours_per_week: 22.5 },
          ],
        },
        defaultUsers[1]!,
      ],
      entries: [
        {
          user: { id: "bm-ada" },
          hours: 18,
          billable: true,
          state: "approved",
        },
      ],
    });

    const result = await service.getUtilisation({ rangeDays: 7 });
    const ada = result.people.find((p) => p.key === "bm-ada");
    expect(ada!.weeklyWorkingHours).toBe(22.5);
    expect(ada!.workingHours).toBe(22.5);
    expect(ada!.utilisationPct).toBe(80);
    expect(ada!.status).toBe("ok");
  });

  it("sums non-billable hours only from entries with billable false", async () => {
    const { service } = makeService({
      entries: [
        {
          user: { id: "bm-ada" },
          hours: 5,
          billable: false,
          state: "approved",
        },
        {
          user: { id: "bm-ada" },
          hours: 3,
          billable: true,
          state: "approved",
        },
        {
          user: { id: "bm-ada" },
          hours: 9,
          state: "approved",
        },
      ],
    });

    const result = await service.getUtilisation({ rangeDays: 7 });
    const ada = result.people.find((p) => p.key === "bm-ada");
    expect(ada!.billableHours).toBe(3);
    expect(ada!.nonBillableHours).toBe(5);
    expect(ada!.totalHours).toBe(8);
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
    expect(ada!.utilisationPct).toBe(16);
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

  it("includes The Curve company hours, including non-billable time", async () => {
    const { service } = makeService({
      entries: [
        {
          user: { id: "bm-ada" },
          hours: 8,
          billable: false,
          nonbillable_reason: "Internal",
          state: "approved",
          date: "2026-08-24",
          project: {
            id: "internal",
            name: "Company ops",
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
          date: "2026-08-25",
          project: {
            id: "client-work",
            name: "Acme App",
            client: { id: "c2", name: "Acme" },
          },
        },
      ],
    });

    const result = await service.getUtilisation({ rangeDays: 7 });
    const ada = result.people.find((p) => p.key === "bm-ada");
    expect(ada!.billableHours).toBe(4);
    expect(ada!.nonBillableHours).toBe(8);
    expect(ada!.totalHours).toBe(12);

    const detail = await service.getPersonDetail({
      userId: "bm-ada",
      rangeDays: 7,
    });
    expect(detail.projects.map((p) => p.projectName)).toEqual([
      "Company ops",
      "Acme App",
    ]);
    expect(detail.nonBillableByProject[0]).toMatchObject({
      projectName: "Company ops",
      clientName: "TheCurve",
      hours: 8,
    });
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
    expect(casey!.weeklyWorkingHours).toBe(30);
    expect(casey!.workingHours).toBe(30);
    expect(casey!.utilisationPct).toBe(40);
  });

  it("populates the person dropdown and filters timesheets by user", async () => {
    const { service, listTimesheetEntries } = makeService({
      entries: [
        {
          user: { id: "bm-ada" },
          hours: 8,
          billable: true,
          state: "approved",
        },
      ],
    });

    const result = await service.getUtilisation({
      rangeDays: 7,
      userId: "bm-ada",
    });

    expect(listTimesheetEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ["bm-ada"],
      }),
    );
    expect(result.users.map((u) => u.displayName).sort()).toEqual([
      "Ada Lovelace",
      "Bob Builder",
    ]);
    expect(result.people.map((p) => p.key)).toEqual(["bm-ada"]);
  });

  it("unwraps nested Bitmap user payloads for the person dropdown", async () => {
    const { service } = makeService({
      users: [
        {
          user: {
            id: "bm-nested",
            full_name: "Nested User",
            hours_per_week: 37.5,
          },
        } as unknown as BitmapUser,
      ],
      members: [],
      entries: [],
    });

    const result = await service.getUtilisation({ rangeDays: 1 });
    expect(result.users.find((u) => u.id === "bm-nested")).toEqual(
      expect.objectContaining({
        id: "bm-nested",
        displayName: "Nested User",
      }),
    );
  });

  it("includes a cumulative series whose last point matches table utilisation", async () => {
    const { service } = makeService({
      entries: [
        {
          user: { id: "bm-ada" },
          hours: 18,
          billable: true,
          state: "approved",
          date: "2026-08-24",
        },
      ],
    });

    vi.useFakeTimers({ now: new Date("2026-08-25T15:00:00.000Z") });
    const result = await service.getUtilisation({ rangeDays: 7 });
    vi.useRealTimers();
    expect(result.targetUtilisationPct).toBe(80);
    expect(result.series).toHaveLength(5);
    expect(
      result.series.every(
        (point) => !["2026-08-22", "2026-08-23"].includes(point.date),
      ),
    ).toBe(true);
    const ada = result.people.find((p) => p.key === "bm-ada");
    const adaSeries = result.personSeries.find((p) => p.key === "bm-ada");
    expect(adaSeries?.points).toHaveLength(5);
    expect(adaSeries?.points.at(-1)?.utilisationPct).toBe(ada?.utilisationPct);
    expect(adaSeries?.points.at(-1)?.billableHours).toBe(18);
  });

  it("omits Saturday and Sunday timesheet hours from utilisation totals", async () => {
    vi.useFakeTimers({ now: new Date("2026-08-25T15:00:00.000Z") });
    const { service } = makeService({
      entries: [
        {
          user: { id: "bm-ada" },
          hours: 6,
          billable: true,
          state: "approved",
          date: "2026-08-24",
        },
        {
          user: { id: "bm-ada" },
          hours: 8,
          billable: true,
          state: "approved",
          date: "2026-08-22",
        },
      ],
    });
    const result = await service.getUtilisation({ rangeDays: 7 });
    vi.useRealTimers();
    const ada = result.people.find((p) => p.key === "bm-ada");
    expect(ada?.billableHours).toBe(6);
    expect(result.series.some((point) => point.date === "2026-08-22")).toBe(
      false,
    );
  });

  it("returns person detail with project and non-billable breakdowns", async () => {
    const { service } = makeService({
      entries: [
        {
          user: { id: "bm-ada", full_name: "Ada Lovelace" },
          hours: 18,
          billable: true,
          state: "approved",
          date: "2026-08-24",
          project: {
            id: "p-client",
            name: "Acme App",
            client: { id: "c1", name: "Acme" },
          },
        },
        {
          user: { id: "bm-ada", full_name: "Ada Lovelace" },
          hours: 6,
          billable: false,
          nonbillable_reason: "Guild time",
          state: "approved",
          date: "2026-08-25",
          project: {
            id: "p-int",
            name: "Engineering guild",
            client: { id: "c2", name: "Internal" },
          },
        },
      ],
    });

    const detail = await service.getPersonDetail({
      userId: "bm-ada",
      rangeDays: 7,
    });

    expect(detail.person.displayName).toBe("Ada Lovelace");
    expect(detail.person.billableHours).toBe(18);
    expect(detail.person.nonBillableHours).toBe(6);
    expect(detail.targetBillableHours).toBe(30);
    expect(detail.hoursToTarget).toBe(12);
    expect(detail.series.at(-1)?.utilisationPct).toBe(
      detail.person.utilisationPct,
    );
    expect(detail.projects).toEqual([
      expect.objectContaining({
        projectName: "Acme App",
        billableHours: 18,
        nonBillableHours: 0,
        pctOfTotal: 75,
      }),
      expect.objectContaining({
        projectName: "Engineering guild",
        billableHours: 0,
        nonBillableHours: 6,
        pctOfTotal: 25,
      }),
    ]);
    expect(detail.nonBillableByReason).toEqual([
      {
        reason: "Guild time",
        hours: 6,
        pctOfNonBillable: 100,
      },
    ]);
    expect(detail.nonBillableByProject[0]).toMatchObject({
      projectName: "Engineering guild",
      hours: 6,
      reasons: [{ reason: "Guild time", hours: 6 }],
    });
  });

  it("throws when the person is unknown", async () => {
    const { service } = makeService({ entries: [] });
    await expect(
      service.getPersonDetail({ userId: "missing", rangeDays: 7 }),
    ).rejects.toBeInstanceOf(UtilisationPersonNotFoundError);
  });
});
