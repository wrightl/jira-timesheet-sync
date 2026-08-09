export interface TimesheetEntryInput {
    clientId: string;
    jiraSpaceKey: string | null;
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

export interface BitmapUser {
    id: string;
    full_name: string;
    email?: string | null;
    job_title?: string | null;
}

export interface BitmapClient {
    id: string;
    name: string;
    client_key?: string | null;
    slug?: string | null;
    has_projects?: boolean | null;
}

export interface BitmapProjectClient {
    id: string;
    name?: string | null;
    client_key?: string | null;
}

export interface BitmapRemainingJiraEstimatesDelta {
    hours?: number | null;
}

export interface BitmapProjectPerson {
    id?: string;
    full_name?: string | null;
    job_title?: string | null;
}

export interface BitmapProject {
    id: string;
    state?: string | null;
    started?: boolean | null;
    name?: string | null;
    key?: string | null;
    jira_budget_jql?: string | null;
    jira_instance_url?: string | null;
    jira_budget_remaining_effort?: number | null;
    jira_budget_remaining_effort_last_updated?: string | null;
    jira_budget_last_sync_error?: string | null;
    remaining_jira_estimates_delta?: BitmapRemainingJiraEstimatesDelta | null;
    time_budgeted?: number | null;
    time_logged?: number | null;
    time_remaining?: number | null;
    time_allocated?: number | null;
    billable_time_used?: number | null;
    billable_time_remaining?: number | null;
    healthy?: boolean | null;
    unhealthy_checks?: number | null;
    start_date?: string | null;
    end_date?: string | null;
    forecast_end_date?: string | null;
    project_type?: string | null;
    client?: BitmapProjectClient | null;
    project_manager?: BitmapProjectPerson | null;
    project_lead?: BitmapProjectPerson | null;
    tech_lead?: BitmapProjectPerson | null;
}

export interface ListProjectsForDiscoveryParams {
    status?: string;
    page?: number;
}

export interface BitmapProjectBudget {
    id: string;
    name: string;
    budget?: number | null;
    day_rate?: number | null;
    time_used?: number | null;
    time_remaining?: number | null;
    time_allocated?: number | null;
    billable_time_used?: number | null;
    billable_time_remaining?: number | null;
    billable_default?: boolean | null;
}

export interface BitmapBurndownPoint {
    date: string;
    total: number;
}

export interface BitmapBurndown {
    total_budget?: number | null;
    burndown?: BitmapBurndownPoint[];
    forecast?: BitmapBurndownPoint[];
    contributions?: {
        dates?: string[];
        contributions?: Record<string, number[]>;
    };
}

export interface BitmapProjectHealthCheck {
    id?: string;
    type?: string | null;
    name?: string | null;
    healthy?: boolean | null;
    message?: string | null;
    created_at?: string | null;
}

export interface BitmapJiraTicket {
    key: string;
    summary?: string | null;
    original_estimate?: number | null;
    aggregate_time_estimate?: number | null;
    aggregate_time_remaining?: number | null;
    aggregate_time_spent?: number | null;
    overage?: number | null;
    unexpected_overage?: boolean | null;
    acknowledged_overage?: boolean | null;
}

export interface BitmapTimesheetEntry {
    id?: string;
    hours?: number | null;
    date?: string | null;
    billable?: boolean | null;
    nonbillable_reason?: string | null;
    notes?: string | null;
}

export interface BitmapTimeAllocationStatistics {
    [budgetName: string]: unknown;
}

export interface PaginatedResponse<T> {
    data: T[];
    current_page?: number;
    next_page?: number | null;
    total_pages?: number;
    total_count?: number;
    page_size?: number;
}

export interface ListProjectsParams {
    clientId: string;
    rangeStart?: string;
    rangeEnd?: string;
    page?: number;
    /** Bitmap status filter. Pass `null` to omit and return all statuses. */
    status?: string | null;
}

export interface ListClientsParams {
    name?: string;
    page?: number;
}

export interface BitmapTimesheetEntryBody {
    timesheet_entry: {
        user_id: string;
        project_id: string;
        project_budget_id: string;
        date: string;
        hours: number | string;
        notes: string;
        billable: string;
        nonbillable_reason: string;
    };
}

export interface BitmapTimesheetEntryUpdateBody {
    timesheet_entry: {
        hours: number | string;
        notes: string;
        project_id: string;
        project_budget_id: string;
        billable: boolean;
    };
}

export interface BitmapApiClient {
    listUsers(page?: number): Promise<PaginatedResponse<BitmapUser>>;
    listClients(
        params?: ListClientsParams,
    ): Promise<PaginatedResponse<BitmapClient>>;
    listProjects(
        params: ListProjectsParams,
    ): Promise<PaginatedResponse<BitmapProject>>;
    listProjectsForDiscovery(
        params?: ListProjectsForDiscoveryParams,
    ): Promise<PaginatedResponse<BitmapProject>>;
    getProject(projectId: string): Promise<BitmapProject>;
    listProjectBudgets(projectId: string): Promise<BitmapProjectBudget[]>;
    getProjectBurndown(projectId: string): Promise<BitmapBurndown>;
    listProjectHealthChecks(
        projectId: string,
    ): Promise<BitmapProjectHealthCheck[]>;
    listProjectJiraTickets(projectId: string): Promise<BitmapJiraTicket[]>;
    listProjectTimesheetEntries(
        projectId: string,
    ): Promise<BitmapTimesheetEntry[]>;
    getTimeAllocationStatistics(
        projectId: string,
    ): Promise<BitmapTimeAllocationStatistics>;
    createTimesheetEntry(
        body: BitmapTimesheetEntryBody,
    ): Promise<TimesheetEntryResult>;
    updateTimesheetEntry(
        timesheetId: string,
        body: BitmapTimesheetEntryUpdateBody,
    ): Promise<TimesheetEntryResult>;
    deleteTimesheetEntry(timesheetId: string): Promise<void>;
}

/** High-level client used by worklog sync (resolves IDs then posts). */
export interface InternalPmClient {
    createTimesheet(input: TimesheetEntryInput): Promise<TimesheetEntryResult>;
    updateTimesheet(
        timesheetId: string,
        input: TimesheetEntryInput,
    ): Promise<TimesheetEntryResult>;
    deleteTimesheet(timesheetId: string): Promise<void>;
}

export class BitmapHttpError extends Error {
    readonly status: number;
    readonly bodySnippet: string;

    constructor(status: number, bodySnippet: string, path: string) {
        super(`Bitmap API ${path} failed (${status}): ${bodySnippet}`);
        this.name = 'BitmapHttpError';
        this.status = status;
        this.bodySnippet = bodySnippet;
    }
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return null;
}

function extractTimesheetId(payload: unknown, fallback: string): string {
    const root = asRecord(payload);
    if (!root) return fallback;
    const entry = asRecord(root.timesheet_entry) ?? asRecord(root.data) ?? root;
    const id = entry.id ?? root.id;
    if (typeof id === 'string' && id.length > 0) return id;
    if (typeof id === 'number') return String(id);
    return fallback;
}

function normalizeArray<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) {
        return payload as T[];
    }
    const root = asRecord(payload);
    if (root && Array.isArray(root.data)) {
        return root.data as T[];
    }
    return [];
}

function normalizeBudgets(payload: unknown): BitmapProjectBudget[] {
    return normalizeArray<BitmapProjectBudget>(payload);
}

function unwrapProject(payload: unknown): BitmapProject {
    const root = asRecord(payload);
    if (!root) return { id: '' };
    const nested = asRecord(root.data) ?? asRecord(root.project) ?? root;
    return nested as unknown as BitmapProject;
}

export class BitmapHttpClient implements BitmapApiClient {
    private readonly accessToken: string;
    private readonly baseUrl: string;

    constructor(options?: { accessToken?: string; baseUrl?: string }) {
        this.accessToken =
            options?.accessToken ?? process.env.INTERNAL_PM_ACCESS_TOKEN ?? '';
        this.baseUrl = (
            options?.baseUrl ??
            process.env.INTERNAL_PM_BASE_URL ??
            'https://bitmap.app'
        ).replace(/\/$/, '');
    }

    private async request<T>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        path: string,
        options?: {
            query?: Record<string, string | number | undefined>;
            body?: unknown;
        },
    ): Promise<T> {
        const url = new URL(`${this.baseUrl}${path}`);
        if (options?.query) {
            for (const [key, value] of Object.entries(options.query)) {
                if (value !== undefined && value !== '') {
                    url.searchParams.set(key, String(value));
                }
            }
        }

        const headers: Record<string, string> = {
            Accept: 'application/json',
        };
        if (this.accessToken) {
            headers.Authorization = `Bearer ${this.accessToken}`;
        }
        if (options?.body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }

        const res = await fetch(url, {
            method,
            headers,
            body:
                options?.body !== undefined
                    ? JSON.stringify(options.body)
                    : undefined,
        });

        const text = await res.text();
        let json: unknown = null;
        if (text) {
            try {
                json = JSON.parse(text);
            } catch {
                json = null;
            }
        }

        if (!res.ok) {
            const snippet = text.slice(0, 300) || res.statusText;
            throw new BitmapHttpError(res.status, snippet, path);
        }

        return (json ?? {}) as T;
    }

    async listUsers(page = 1): Promise<PaginatedResponse<BitmapUser>> {
        return this.request<PaginatedResponse<BitmapUser>>(
            'GET',
            '/api/v1/users.json',
            { query: { state: 'employed', page } },
        );
    }

    async listClients(
        params?: ListClientsParams,
    ): Promise<PaginatedResponse<BitmapClient>> {
        return this.request<PaginatedResponse<BitmapClient>>(
            'GET',
            '/api/v1/clients.json',
            {
                query: {
                    name: params?.name ?? '',
                    page: params?.page ?? 1,
                },
            },
        );
    }

    async listProjects(
        params: ListProjectsParams,
    ): Promise<PaginatedResponse<BitmapProject>> {
        return this.request<PaginatedResponse<BitmapProject>>(
            'GET',
            '/api/v1/projects.json',
            {
                query: {
                    client_id: params.clientId,
                    page: params.page ?? 1,
                    start_date_range_start: params.rangeStart,
                    start_date_range_end: params.rangeEnd,
                    // null = all statuses (omit param); undefined defaults to active
                    status:
                        params.status === null
                            ? undefined
                            : (params.status ?? 'active'),
                },
            },
        );
    }

    async listProjectsForDiscovery(
        params?: ListProjectsForDiscoveryParams,
    ): Promise<PaginatedResponse<BitmapProject>> {
        return this.request<PaginatedResponse<BitmapProject>>(
            'GET',
            '/api/v1/projects.json',
            {
                query: {
                    page: params?.page ?? 1,
                    status: params?.status ?? 'active',
                },
            },
        );
    }

    async getProject(projectId: string): Promise<BitmapProject> {
        const payload = await this.request<unknown>(
            'GET',
            `/api/v1/projects/${projectId}`,
        );
        const project = unwrapProject(payload);
        if (!project.id) {
            return { ...project, id: projectId };
        }
        return project;
    }

    async listProjectBudgets(
        projectId: string,
    ): Promise<BitmapProjectBudget[]> {
        const payload = await this.request<unknown>(
            'GET',
            `/api/v1/projects/${projectId}/project_budgets`,
            { query: { project_id: projectId } },
        );
        return normalizeBudgets(payload);
    }

    async getProjectBurndown(projectId: string): Promise<BitmapBurndown> {
        return this.request<BitmapBurndown>(
            'GET',
            `/api/v1/projects/${projectId}/burndown`,
        );
    }

    async listProjectHealthChecks(
        projectId: string,
    ): Promise<BitmapProjectHealthCheck[]> {
        const payload = await this.request<unknown>(
            'GET',
            `/api/v1/projects/${projectId}/project_health_checks`,
        );
        return normalizeArray<BitmapProjectHealthCheck>(payload);
    }

    async listProjectJiraTickets(
        projectId: string,
    ): Promise<BitmapJiraTicket[]> {
        const payload = await this.request<unknown>(
            'GET',
            `/api/v1/projects/${projectId}/jira_tickets`,
        );
        return normalizeArray<BitmapJiraTicket>(payload);
    }

    async listProjectTimesheetEntries(
        projectId: string,
    ): Promise<BitmapTimesheetEntry[]> {
        const payload = await this.request<unknown>(
            'GET',
            `/api/v1/projects/${projectId}/timesheet_entries`,
        );
        return normalizeArray<BitmapTimesheetEntry>(payload);
    }

    async getTimeAllocationStatistics(
        projectId: string,
    ): Promise<BitmapTimeAllocationStatistics> {
        return this.request<BitmapTimeAllocationStatistics>(
            'GET',
            `/api/v1/projects/${projectId}/time_allocation_statistics`,
        );
    }

    async createTimesheetEntry(
        body: BitmapTimesheetEntryBody,
    ): Promise<TimesheetEntryResult> {
        const payload = await this.request<unknown>(
            'POST',
            '/api/v1/timesheet_entries',
            { body },
        );
        return {
            timesheetId: extractTimesheetId(
                payload,
                `ts-${body.timesheet_entry.user_id}-${body.timesheet_entry.date}`,
            ),
        };
    }

    async updateTimesheetEntry(
        timesheetId: string,
        body: BitmapTimesheetEntryUpdateBody,
    ): Promise<TimesheetEntryResult> {
        const payload = await this.request<unknown>(
            'PUT',
            `/api/v1/timesheet_entries/${timesheetId}`,
            { body },
        );
        return {
            timesheetId: extractTimesheetId(payload, timesheetId),
        };
    }

    async deleteTimesheetEntry(timesheetId: string): Promise<void> {
        await this.request<unknown>(
            'DELETE',
            `/api/v1/timesheet_entries/${timesheetId}`,
        );
    }
}

export function createBitmapApiClient(options?: {
    accessToken?: string;
    baseUrl?: string;
}): BitmapApiClient {
    return new BitmapHttpClient(options);
}
