import { describe, expect, it } from "vitest";
import type {
  BitmapProject,
  BitmapProjectBudget,
  BitmapTimesheetEntry,
  BitmapUser,
} from "@/clients/bitmap-http";
import { EXCLUDED_CLIENT_ID_THECURVE } from "@/lib/excluded-clients";
import { ROLE_DAY_RATE_TITLES } from "@/lib/role-day-rates";
import { ProfitabilityService } from "@/services/profitability-service";

const senior: BitmapUser = {
  id: "u1",
  full_name: "Amina Shah",
  job_title: "Senior Software Engineer",
};

function rateSchedule(
  amounts: Partial<Record<(typeof ROLE_DAY_RATE_TITLES)[number], number>>,
  effectiveMonth = "2020-01",
) {
  return {
    id: `schedule-${effectiveMonth}`,
    effectiveMonth,
    rates: ROLE_DAY_RATE_TITLES.flatMap((roleName) => {
      const dayRateCost = amounts[roleName];
      return dayRateCost == null ? [] : [{ roleName, dayRateCost }];
    }),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function project(
  overrides: Partial<BitmapProject> & Pick<BitmapProject, "id" | "end_date">,
): BitmapProject {
  return {
    name: overrides.name ?? overrides.id,
    state: "completed",
    client: { id: "c1", name: "Acme" },
    ...overrides,
  };
}

function entry(
  hours: number,
  options?: {
    billable?: boolean;
    userId?: string;
    budgetId?: string;
    date?: string;
  },
): BitmapTimesheetEntry {
  return {
    hours,
    date: options?.date ?? "2026-03-01",
    billable: options?.billable ?? true,
    state: "approved",
    user: { id: options?.userId ?? "u1", full_name: "Amina Shah" },
    project_budget_id: options?.budgetId ?? "b1",
  };
}

describe("ProfitabilityService", () => {
  function service(options?: {
    projects?: BitmapProject[];
    entries?: Record<string, BitmapTimesheetEntry[]>;
    budgets?: Record<string, BitmapProjectBudget[]>;
    token?: boolean;
    users?: BitmapUser[];
  }) {
    const projects = options?.projects ?? [
      project({ id: "in", name: "In range", end_date: "2026-03-15" }),
      project({ id: "out", name: "Too early", end_date: "2025-12-01" }),
      project({ id: "open-ended", name: "No end", end_date: null }),
      project({
        id: "internal",
        name: "Company",
        end_date: "2026-03-20",
        client: { id: EXCLUDED_CLIENT_ID_THECURVE, name: "The Curve" },
      }),
    ];
    const entries = options?.entries ?? {
      in: [entry(15)],
    };
    const budgets = options?.budgets ?? {
      in: [
        {
          id: "b1",
          name: "Delivery",
          day_rate: 750,
          billable_default: true,
          budget: 100,
        },
      ],
    };

    return new ProfitabilityService(
      {
        async isTokenConfigured() {
          return options?.token ?? true;
        },
        async createConfiguredBitmapClient() {
          return {
            async listUsers() {
              return {
                data: options?.users ?? [senior],
                next_page: null,
                total_pages: 1,
              };
            },
            async listProjectsForDiscovery() {
              return { data: projects, next_page: null, total_pages: 1 };
            },
            async listProjectBudgets(projectId: string) {
              return budgets[projectId] ?? [];
            },
            async listProjectTimesheetEntries(projectId: string) {
              return entries[projectId] ?? [];
            },
          };
        },
      },
      {
        async list() {
          return [rateSchedule({ "Senior Software Engineer": 500 })];
        },
      },
      { async list() { return []; } },
    );
  }

  it("scores closed projects inside the date range", async () => {
    const result = await service().getProfitability({
      startDate: "2026-01-01",
      endDate: "2026-03-31",
    });

    expect(result.projectOptions.map((row) => row.projectId)).toEqual(["in"]);
    expect(result.completedWithoutEndDate).toBe(1);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toMatchObject({
      projectId: "in",
      charged: 1500,
      cost: 1000,
      profitabilityPct: 150,
      belowThreshold: false,
    });
    expect(result.summary.averageProfitabilityPct).toBe(150);
    expect(result.summary.belowThresholdCount).toBe(0);
    expect(result.summary.grossProfit).toBe(500);
  });

  it("limits metrics to the selected project", async () => {
    const result = await service({
      projects: [
        project({ id: "a", name: "A", end_date: "2026-02-01" }),
        project({ id: "b", name: "B", end_date: "2026-02-02" }),
      ],
      entries: {
        a: [entry(7.5)],
        b: [entry(7.5)],
      },
      budgets: {
        a: [{ id: "b1", name: "A", day_rate: 90, billable_default: true }],
        b: [{ id: "b1", name: "B", day_rate: 900, billable_default: true }],
      },
    }).getProfitability({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      projectId: "a",
    });

    expect(result.projectOptions).toHaveLength(2);
    expect(result.projects.map((row) => row.projectId)).toEqual(["a"]);
    expect(result.summary.belowThresholdCount).toBe(1);
    expect(result.projects[0]?.profitabilityPct).toBe(18);
  });

  it("limits metrics to the selected client", async () => {
    const result = await service({
      projects: [
        project({
          id: "a",
          name: "A",
          end_date: "2026-02-01",
          client: { id: "c1", name: "Acme" },
        }),
        project({
          id: "b",
          name: "B",
          end_date: "2026-02-02",
          client: { id: "c2", name: "Northwind" },
        }),
      ],
      entries: {
        a: [entry(7.5)],
        b: [entry(7.5)],
      },
      budgets: {
        a: [{ id: "b1", name: "A", day_rate: 90, billable_default: true }],
        b: [{ id: "b1", name: "B", day_rate: 900, billable_default: true }],
      },
    }).getProfitability({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      clientId: "c2",
    });

    expect(result.clientOptions).toEqual([
      { clientId: "c1", clientName: "Acme" },
      { clientId: "c2", clientName: "Northwind" },
    ]);
    expect(result.projectOptions.map((row) => row.projectId)).toEqual(["b"]);
    expect(result.projects.map((row) => row.projectId)).toEqual(["b"]);
    expect(result.projects[0]?.profitabilityPct).toBe(180);
    expect(result.summary.projectCount).toBe(1);
  });

  it("uses the user-mapping job title when Bitmap has none", async () => {
    const withMapping = new ProfitabilityService(
      {
        async isTokenConfigured() {
          return true;
        },
        async createConfiguredBitmapClient() {
          return {
            async listUsers() {
              return {
                data: [{ id: "u1", full_name: "Amina Shah", job_title: null }],
                next_page: null,
              };
            },
            async listProjectsForDiscovery() {
              return {
                data: [
                  project({ id: "in", name: "In range", end_date: "2026-03-15" }),
                ],
                next_page: null,
              };
            },
            async listProjectBudgets() {
              return [
                {
                  id: "b1",
                  name: "Delivery",
                  day_rate: 750,
                  billable_default: true,
                },
              ];
            },
            async listProjectTimesheetEntries() {
              return [entry(7.5)];
            },
          };
        },
      },
      {
        async list() {
          return [rateSchedule({ "Project Manager": 400 })];
        },
      },
      {
        async list() {
          return [
            {
              id: "m1",
              jiraDisplayName: "Amina Shah",
              jiraAccountId: null,
              bitmapUserId: "u1",
              bitmapEmail: null,
              jobTitle: "Project Manager",
              enabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
        },
      },
    );

    const result = await withMapping.getProfitability({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });
    expect(result.projects[0]).toMatchObject({
      charged: 750,
      cost: 400,
      profitabilityPct: 187.5,
      unratedHours: 0,
    });
  });

  it("requires a Bitmap token", async () => {
    await expect(
      service({ token: false }).getProfitability({
        startDate: "2026-01-01",
        endDate: "2026-03-31",
      }),
    ).rejects.toThrow(/token/i);
  });
});
