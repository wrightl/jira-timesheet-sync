import type {
  BitmapApiClient,
  BitmapProject,
  BitmapProjectBudget,
  BitmapTimesheetEntry,
  BitmapUser,
} from "@/clients/bitmap-http";
import { getDb, type Db } from "@/db";
import { withoutExcludedClientProjects } from "@/lib/excluded-clients";
import {
  LOW_PROFITABILITY_PCT,
  PROFITABILITY_PROJECT_CAP,
  assertProfitabilityDateRange,
  compareProjectProfitability,
  isoDateKey,
  profitabilityBillableFlag,
  scoreClosedProject,
  summariseProfitability,
  type ProfitabilityBudget,
  type ProfitabilityEntry,
  type ProfitabilitySummary,
  type ProjectProfitability,
} from "@/lib/profitability";
import type { RoleRateSchedule } from "@/lib/role-day-rates";
import { HOURS_PER_WORKING_DAY } from "@/lib/working-duration";
import { RoleDayRatesRepository } from "@/repositories/role-day-rates-repository";
import { UserMappingsRepository } from "@/repositories/user-mappings-repository";
import { createSettingsService } from "@/services/settings-service";

export type ProfitabilityProjectOption = {
  projectId: string;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
};

export type ProfitabilityClientOption = {
  clientId: string;
  clientName: string;
};

export type ProfitabilityResult = {
  startDate: string;
  endDate: string;
  clientId: string | null;
  projectId: string | null;
  thresholdPct: number;
  hoursPerDay: number;
  summary: ProfitabilitySummary;
  projects: ProjectProfitability[];
  clientOptions: ProfitabilityClientOption[];
  projectOptions: ProfitabilityProjectOption[];
  completedWithoutEndDate: number;
  truncated: boolean;
  generatedAt: string;
};

type ProfitabilityBitmap = Pick<
  BitmapApiClient,
  | "listUsers"
  | "listProjectsForDiscovery"
  | "listProjectBudgets"
  | "listProjectTimesheetEntries"
>;

type SettingsPort = {
  isTokenConfigured(): Promise<boolean>;
  createConfiguredBitmapClient(): Promise<ProfitabilityBitmap>;
};

function finiteNumber(value: unknown): number | null {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  return Number.isFinite(number) ? number : null;
}

function asBitmapUser(raw: unknown): BitmapUser | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = record.id;
  if (typeof id !== "string" || id.length === 0) return null;
  const jobTitle = record.job_title;
  return {
    id,
    full_name: typeof record.full_name === "string" ? record.full_name : "",
    job_title: typeof jobTitle === "string" ? jobTitle : null,
  };
}

async function listBitmapUsers(
  api: ProfitabilityBitmap,
): Promise<BitmapUser[]> {
  const users: BitmapUser[] = [];
  let page = 1;
  while (page <= 50) {
    const response = await api.listUsers(page);
    for (const row of response.data ?? []) {
      const user = asBitmapUser(row);
      if (user) users.push(user);
    }
    if (
      response.next_page == null ||
      response.next_page === page ||
      (response.total_pages != null && page >= response.total_pages)
    ) {
      break;
    }
    page = response.next_page;
  }
  return users;
}

async function listCompletedProjects(
  api: ProfitabilityBitmap,
): Promise<BitmapProject[]> {
  const projects: BitmapProject[] = [];
  let page = 1;
  while (page <= 20) {
    const response = await api.listProjectsForDiscovery({
      status: "completed",
      page,
    });
    projects.push(...(response.data ?? []));
    if (
      !response.next_page ||
      response.next_page === page ||
      (response.data?.length ?? 0) === 0 ||
      (response.total_pages != null && page >= response.total_pages)
    ) {
      break;
    }
    page = response.next_page;
  }
  return projects;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]!);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function resolveJobTitle(
  entry: BitmapTimesheetEntry,
  users: Map<string, BitmapUser>,
  mappingTitles: Map<string, string>,
): string | null {
  const fromEntry = entry.user?.job_title?.trim();
  if (fromEntry) return fromEntry;
  const userId = entry.user?.id;
  if (!userId) return null;
  const fromUser = users.get(userId)?.job_title?.trim();
  if (fromUser) return fromUser;
  return mappingTitles.get(userId)?.trim() || null;
}

function toEntry(
  entry: BitmapTimesheetEntry,
  users: Map<string, BitmapUser>,
  mappingTitles: Map<string, string>,
): ProfitabilityEntry {
  return {
    hours: finiteNumber(entry.hours) ?? 0,
    billable: profitabilityBillableFlag(entry.billable),
    state: entry.state ?? null,
    date: isoDateKey(entry.date),
    jobTitle: resolveJobTitle(entry, users, mappingTitles),
    projectBudgetId:
      entry.project_budget?.id ?? entry.project_budget_id ?? null,
    budgetDayRate: finiteNumber(entry.project_budget?.day_rate),
  };
}

function toBudget(budget: BitmapProjectBudget): ProfitabilityBudget {
  const weight =
    finiteNumber(budget.time_used) ??
    finiteNumber(budget.billable_time_used) ??
    finiteNumber(budget.budget);
  return {
    id: budget.id,
    dayRate: finiteNumber(budget.day_rate),
    billableDefault: budget.billable_default === true,
    weightHours: weight,
  };
}

function clientOption(
  project: BitmapProject,
): ProfitabilityClientOption | null {
  const clientId = project.client?.id?.trim() ?? "";
  if (!clientId) return null;
  const clientName = project.client?.name?.trim() || clientId;
  return { clientId, clientName };
}

function failedProject(
  project: BitmapProject,
  endDate: string,
  err: unknown,
): ProjectProfitability {
  return scoreClosedProject({
    projectId: project.id,
    projectName: project.name ?? null,
    clientId: project.client?.id ?? null,
    clientName: project.client?.name ?? null,
    endDate,
    entries: [],
    budgets: [],
    roleRateSchedules: [],
    loadError: err instanceof Error ? err.message : "Failed to load project",
  });
}

export class ProfitabilityService {
  constructor(
    private readonly settings: SettingsPort,
    private readonly rates: Pick<RoleDayRatesRepository, "list">,
    private readonly mappings: Pick<UserMappingsRepository, "list">,
  ) {}

  async getProfitability(input: {
    startDate: string;
    endDate: string;
    clientId?: string | null;
    projectId?: string | null;
  }): Promise<ProfitabilityResult> {
    const startDate = input.startDate.trim();
    const endDate = input.endDate.trim();
    assertProfitabilityDateRange(startDate, endDate);
    const clientId = input.clientId?.trim() || null;
    const projectId = input.projectId?.trim() || null;

    if (!(await this.settings.isTokenConfigured())) {
      throw new Error("Bitmap access token is not configured");
    }

    const bitmap = await this.settings.createConfiguredBitmapClient();
    const [rateRows, mappingRows, completed, bitmapUsers] = await Promise.all([
      this.rates.list(),
      this.mappings.list(),
      listCompletedProjects(bitmap),
      listBitmapUsers(bitmap),
    ]);

    const roleRateSchedules: RoleRateSchedule[] = rateRows.map((row) => ({
      effectiveMonth: row.effectiveMonth,
      rates: row.rates.map((rate) => ({
        roleName: rate.roleName,
        dayRateCost: finiteNumber(rate.dayRateCost) ?? 0,
      })),
    }));
    const mappingTitles = new Map<string, string>();
    for (const mapping of mappingRows) {
      const title = mapping.jobTitle?.trim();
      if (title && mapping.bitmapUserId) {
        mappingTitles.set(mapping.bitmapUserId, title);
      }
    }
    const users = new Map(bitmapUsers.map((user) => [user.id, user]));

    let completedWithoutEndDate = 0;
    const inRange: BitmapProject[] = [];
    for (const project of withoutExcludedClientProjects(completed)) {
      const closedOn = isoDateKey(project.end_date);
      if (!closedOn) {
        completedWithoutEndDate += 1;
        continue;
      }
      if (closedOn >= startDate && closedOn <= endDate) {
        inRange.push(project);
      }
    }
    inRange.sort((a, b) =>
      (isoDateKey(b.end_date) ?? "").localeCompare(isoDateKey(a.end_date) ?? ""),
    );

    const clientOptions: ProfitabilityClientOption[] = [];
    const seenClients = new Set<string>();
    for (const project of inRange) {
      const client = clientOption(project);
      if (!client || seenClients.has(client.clientId)) continue;
      seenClients.add(client.clientId);
      clientOptions.push(client);
    }
    clientOptions.sort((a, b) =>
      a.clientName.localeCompare(b.clientName, undefined, { sensitivity: "base" }),
    );

    const forClient = clientId
      ? inRange.filter((project) => project.client?.id === clientId)
      : inRange;

    const projectOptions = forClient.map((project) => ({
      projectId: project.id,
      projectName: project.name ?? null,
      clientId: project.client?.id ?? null,
      clientName: project.client?.name ?? null,
    }));

    let selected = forClient;
    let truncated = false;
    if (projectId) {
      selected = forClient.filter((project) => project.id === projectId);
    } else if (forClient.length > PROFITABILITY_PROJECT_CAP) {
      selected = forClient.slice(0, PROFITABILITY_PROJECT_CAP);
      truncated = true;
    }

    const projects = await mapWithConcurrency(selected, 5, async (project) => {
      const end = isoDateKey(project.end_date) ?? endDate;
      try {
        const [entries, budgets] = await Promise.all([
          bitmap.listProjectTimesheetEntries(project.id),
          bitmap.listProjectBudgets(project.id),
        ]);
        return scoreClosedProject({
          projectId: project.id,
          projectName: project.name ?? null,
          clientId: project.client?.id ?? null,
          clientName: project.client?.name ?? null,
          endDate: end,
          entries: entries.map((entry) => toEntry(entry, users, mappingTitles)),
          budgets: budgets.map(toBudget),
          roleRateSchedules,
        });
      } catch (err) {
        return failedProject(project, end, err);
      }
    });

    projects.sort(compareProjectProfitability);

    return {
      startDate,
      endDate,
      clientId,
      projectId,
      thresholdPct: LOW_PROFITABILITY_PCT,
      hoursPerDay: HOURS_PER_WORKING_DAY,
      summary: summariseProfitability(projects),
      projects,
      clientOptions,
      projectOptions,
      completedWithoutEndDate,
      truncated,
      generatedAt: new Date().toISOString(),
    };
  }
}

export function createProfitabilityService(db: Db = getDb()) {
  return new ProfitabilityService(
    createSettingsService(db),
    new RoleDayRatesRepository(db),
    new UserMappingsRepository(db),
  );
}
