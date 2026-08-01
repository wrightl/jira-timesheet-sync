export interface TimesheetEntryInput {
  internalProjectId: string;
  jiraWorklogId: string;
  jiraIssueKey: string | null;
  authorAccountId: string | null;
  authorDisplayName: string | null;
  timeSpentSeconds: number | null;
  started: string | null;
  comment: string | null;
}

export interface TimesheetEntryResult {
  timesheetId: string;
}

export interface InternalPmClient {
  createTimesheet(input: TimesheetEntryInput): Promise<TimesheetEntryResult>;
  updateTimesheet(
    timesheetId: string,
    input: TimesheetEntryInput,
  ): Promise<TimesheetEntryResult>;
  deleteTimesheet(timesheetId: string): Promise<void>;
}

/**
 * Stub client for the internal project management timesheet API.
 * Replace with a real HTTP implementation when the API is available.
 */
export class StubInternalPmClient implements InternalPmClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly store = new Map<string, TimesheetEntryInput>();

  constructor(options?: { accessToken?: string; baseUrl?: string }) {
    this.accessToken =
      options?.accessToken ?? process.env.INTERNAL_PM_ACCESS_TOKEN ?? "";
    this.baseUrl =
      options?.baseUrl ??
      process.env.INTERNAL_PM_BASE_URL ??
      "https://pm.example.internal";
  }

  async createTimesheet(
    input: TimesheetEntryInput,
  ): Promise<TimesheetEntryResult> {
    const timesheetId = `ts-stub-${input.jiraWorklogId}`;
    this.store.set(timesheetId, input);
    console.info("[StubInternalPmClient] createTimesheet", {
      baseUrl: this.baseUrl,
      hasToken: Boolean(this.accessToken),
      timesheetId,
      projectId: input.internalProjectId,
      worklogId: input.jiraWorklogId,
      seconds: input.timeSpentSeconds,
    });
    return { timesheetId };
  }

  async updateTimesheet(
    timesheetId: string,
    input: TimesheetEntryInput,
  ): Promise<TimesheetEntryResult> {
    this.store.set(timesheetId, input);
    console.info("[StubInternalPmClient] updateTimesheet", {
      timesheetId,
      projectId: input.internalProjectId,
      worklogId: input.jiraWorklogId,
      seconds: input.timeSpentSeconds,
    });
    return { timesheetId };
  }

  async deleteTimesheet(timesheetId: string): Promise<void> {
    this.store.delete(timesheetId);
    console.info("[StubInternalPmClient] deleteTimesheet", { timesheetId });
  }
}

export function createInternalPmClient(options?: {
  accessToken?: string;
  baseUrl?: string;
}): InternalPmClient {
  return new StubInternalPmClient(options);
}
