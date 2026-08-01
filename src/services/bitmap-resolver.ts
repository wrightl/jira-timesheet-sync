import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { userMappings } from "@/db/schema";
import {
  createBitmapApiClient,
  type BitmapApiClient,
  type BitmapProject,
  type BitmapProjectBudget,
  type BitmapTimesheetEntryBody,
  type BitmapUser,
  type InternalPmClient,
  type PaginatedResponse,
  type TimesheetEntryInput,
  type TimesheetEntryResult,
} from "@/clients/internal-pm";
import {
  getCachedJson,
  projectBudgetsCacheKey,
  projectsCacheKey,
  setCachedJson,
} from "@/services/api-cache";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Format like: Sun Feb 01 2026 00:00:00 GMT+0000 */
export function formatBitmapDateRangeBound(date: Date): string {
  const day = DAY_NAMES[date.getUTCDay()];
  const month = MONTH_NAMES[date.getUTCMonth()];
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${day} ${month} ${dd} ${yyyy} ${hh}:${mm}:${ss} GMT+0000`;
}

export function projectDateRangeFromStarted(started: string): {
  rangeStart: string;
  rangeEnd: string;
} {
  const parsed = new Date(started);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid worklog started date: ${started}`);
  }

  const rangeStartDate = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1, 0, 0, 0),
  );
  const rangeEndDate = new Date(
    Date.UTC(
      parsed.getUTCFullYear() + 1,
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
      23,
      59,
      59,
    ),
  );

  return {
    rangeStart: formatBitmapDateRangeBound(rangeStartDate),
    rangeEnd: formatBitmapDateRangeBound(rangeEndDate),
  };
}

export function formatTimesheetDate(started: string): string {
  const parsed = new Date(started);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid worklog started date: ${started}`);
  }
  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function hoursFromSeconds(timeSpentSeconds: number): number {
  return timeSpentSeconds / 3600;
}

export function budgetCategoryFromJobTitle(
  jobTitle: string | null | undefined,
): "QA" | "Development" {
  if (jobTitle && /qa/i.test(jobTitle)) {
    return "QA";
  }
  return "Development";
}

export function selectActiveStartedProject(
  projects: BitmapProject[],
): BitmapProject | null {
  return (
    projects.find((p) => p.state === "active" && p.started === true) ?? null
  );
}

export function selectProjectBudget(
  budgets: BitmapProjectBudget[],
  jobTitle: string | null | undefined,
): BitmapProjectBudget | null {
  const preferredName = budgetCategoryFromJobTitle(jobTitle);
  const byName = budgets.find(
    (b) => b.name.trim().toLowerCase() === preferredName.toLowerCase(),
  );
  if (byName) return byName;

  return (
    budgets.find(
      (b) =>
        typeof b.billable_time_remaining === "number" &&
        b.billable_time_remaining > 0,
    ) ?? null
  );
}

export function buildTimesheetBody(params: {
  userId: string;
  projectId: string;
  projectBudgetId: string;
  started: string;
  timeSpentSeconds: number;
  comment: string | null;
}): BitmapTimesheetEntryBody {
  return {
    timesheet_entry: {
      user_id: params.userId,
      project_id: params.projectId,
      project_budget_id: params.projectBudgetId,
      date: formatTimesheetDate(params.started),
      hours: hoursFromSeconds(params.timeSpentSeconds),
      notes: params.comment ?? "",
      billable: "true",
      nonbillable_reason: "",
    },
  };
}

export async function findBitmapUserByFullName(
  api: BitmapApiClient,
  displayName: string,
): Promise<BitmapUser | null> {
  let page = 1;
  const maxPages = 50;

  while (page <= maxPages) {
    const response = await api.listUsers(page);
    const match = (response.data ?? []).find(
      (user) => user.full_name === displayName,
    );
    if (match) return match;

    if (
      response.next_page == null ||
      response.next_page === page ||
      (response.total_pages != null && page >= response.total_pages)
    ) {
      break;
    }
    page = response.next_page;
  }

  return null;
}

async function resolveUserMapping(
  db: Db,
  api: BitmapApiClient,
  input: TimesheetEntryInput,
): Promise<{
  bitmapUserId: string;
  jobTitle: string | null;
}> {
  if (!input.authorDisplayName) {
    throw new Error("Worklog author displayName is required for user mapping");
  }

  const existingRows = await db
    .select()
    .from(userMappings)
    .where(eq(userMappings.jiraDisplayName, input.authorDisplayName))
    .limit(1);

  const existing = existingRows[0];
  if (existing) {
    if (!existing.enabled) {
      throw new Error(
        `User mapping for "${input.authorDisplayName}" is disabled`,
      );
    }
    return {
      bitmapUserId: existing.bitmapUserId,
      jobTitle: existing.jobTitle,
    };
  }

  const bitmapUser = await findBitmapUserByFullName(
    api,
    input.authorDisplayName,
  );
  if (!bitmapUser) {
    throw new Error(
      `No Bitmap user found matching displayName "${input.authorDisplayName}"`,
    );
  }

  const [inserted] = await db
    .insert(userMappings)
    .values({
      jiraDisplayName: input.authorDisplayName,
      jiraAccountId: input.authorAccountId,
      bitmapUserId: bitmapUser.id,
      bitmapEmail: bitmapUser.email ?? null,
      jobTitle: bitmapUser.job_title ?? null,
      enabled: true,
    })
    .onConflictDoUpdate({
      target: userMappings.jiraDisplayName,
      set: {
        jiraAccountId: input.authorAccountId,
        bitmapUserId: bitmapUser.id,
        bitmapEmail: bitmapUser.email ?? null,
        jobTitle: bitmapUser.job_title ?? null,
        enabled: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  return {
    bitmapUserId: inserted.bitmapUserId,
    jobTitle: inserted.jobTitle,
  };
}

async function resolveProjects(
  db: Db,
  api: BitmapApiClient,
  clientId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<BitmapProject[]> {
  const cacheKey = projectsCacheKey(clientId, rangeStart, rangeEnd);
  const cached =
    await getCachedJson<PaginatedResponse<BitmapProject>>(db, cacheKey);
  if (cached?.data) {
    return cached.data;
  }

  const response = await api.listProjects({
    clientId,
    rangeStart,
    rangeEnd,
    page: 1,
    status: "active",
  });

  await setCachedJson(db, {
    cacheKey,
    resourceType: "projects",
    requestMeta: { clientId, rangeStart, rangeEnd, page: 1, status: "active" },
    responseBody: response,
  });

  return response.data ?? [];
}

async function resolveBudgets(
  db: Db,
  api: BitmapApiClient,
  projectId: string,
): Promise<BitmapProjectBudget[]> {
  const cacheKey = projectBudgetsCacheKey(projectId);
  const cached = await getCachedJson<BitmapProjectBudget[]>(db, cacheKey);
  if (cached) {
    return cached;
  }

  const budgets = await api.listProjectBudgets(projectId);

  await setCachedJson(db, {
    cacheKey,
    resourceType: "project_budgets",
    requestMeta: { projectId },
    responseBody: budgets,
  });

  return budgets;
}

export async function resolveTimesheetBody(
  db: Db,
  api: BitmapApiClient,
  input: TimesheetEntryInput,
): Promise<BitmapTimesheetEntryBody> {
  if (input.timeSpentSeconds == null) {
    throw new Error("Worklog timeSpentSeconds is required");
  }
  if (!input.started) {
    throw new Error("Worklog started date is required");
  }

  const user = await resolveUserMapping(db, api, input);
  const { rangeStart, rangeEnd } = projectDateRangeFromStarted(input.started);
  const projects = await resolveProjects(
    db,
    api,
    input.clientId,
    rangeStart,
    rangeEnd,
  );
  const project = selectActiveStartedProject(projects);
  if (!project) {
    throw new Error(
      `No active started project found for client ${input.clientId}`,
    );
  }

  const budgets = await resolveBudgets(db, api, project.id);
  const budget = selectProjectBudget(budgets, user.jobTitle);
  if (!budget) {
    throw new Error(
      `No suitable project budget found for project ${project.id}`,
    );
  }

  return buildTimesheetBody({
    userId: user.bitmapUserId,
    projectId: project.id,
    projectBudgetId: budget.id,
    started: input.started,
    timeSpentSeconds: input.timeSpentSeconds,
    comment: input.comment,
  });
}

export function createResolvingPmClient(options: {
  db: Db;
  api?: BitmapApiClient;
  accessToken?: string;
  baseUrl?: string;
}): InternalPmClient {
  const api =
    options.api ??
    createBitmapApiClient({
      accessToken: options.accessToken,
      baseUrl: options.baseUrl,
    });
  const { db } = options;

  return {
    async createTimesheet(
      input: TimesheetEntryInput,
    ): Promise<TimesheetEntryResult> {
      const body = await resolveTimesheetBody(db, api, input);
      return api.createTimesheetEntry(body);
    },

    async updateTimesheet(
      timesheetId: string,
      input: TimesheetEntryInput,
    ): Promise<TimesheetEntryResult> {
      const body = await resolveTimesheetBody(db, api, input);
      return api.updateTimesheetEntry(timesheetId, body);
    },

    async deleteTimesheet(timesheetId: string): Promise<void> {
      await api.deleteTimesheetEntry(timesheetId);
    },
  };
}
