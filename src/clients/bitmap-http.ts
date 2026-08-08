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

export interface BitmapProjectClient {
    id: string;
    name?: string | null;
    client_key?: string | null;
}

export interface BitmapProject {
    id: string;
    state?: string | null;
    started?: boolean | null;
    name?: string | null;
    jira_budget_jql?: string | null;
    client?: BitmapProjectClient | null;
}

export interface ListProjectsForDiscoveryParams {
    status?: string;
    page?: number;
}

export interface BitmapProjectBudget {
    id: string;
    name: string;
    billable_time_remaining?: number | null;
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
    rangeStart: string;
    rangeEnd: string;
    page?: number;
    status?: string;
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
    listProjects(
        params: ListProjectsParams,
    ): Promise<PaginatedResponse<BitmapProject>>;
    listProjectsForDiscovery(
        params?: ListProjectsForDiscoveryParams,
    ): Promise<PaginatedResponse<BitmapProject>>;
    listProjectBudgets(projectId: string): Promise<BitmapProjectBudget[]>;
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

function normalizeBudgets(payload: unknown): BitmapProjectBudget[] {
    if (Array.isArray(payload)) {
        return payload as BitmapProjectBudget[];
    }
    const root = asRecord(payload);
    if (root && Array.isArray(root.data)) {
        return root.data as BitmapProjectBudget[];
    }
    return [];
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
                    status: params.status ?? 'active',
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
