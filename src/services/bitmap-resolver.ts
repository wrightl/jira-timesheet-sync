import type { Db } from '@/db';
import { getDb } from '@/db';
import {
    createBitmapApiClient,
    type BitmapApiClient,
    type BitmapProject,
    type BitmapProjectBudget,
    type BitmapTimesheetEntryBody,
    type BitmapTimesheetEntryUpdateBody,
    type BitmapUser,
    type InternalPmClient,
    type PaginatedResponse,
    type TimesheetEntryInput,
    type TimesheetEntryResult,
} from '@/clients/bitmap-http';
import { UserMappingsRepository } from '@/repositories/user-mappings-repository';
import { UsersRepository } from '@/repositories/users-repository';
import { UserSpaceMappingsRepository } from '@/repositories/user-space-mappings-repository';
import {
    ApiCacheService,
    createApiCacheService,
    projectBudgetsCacheKey,
    projectsCacheKey,
    projectsStatusCacheKey,
} from '@/services/api-cache';
import type { ProjectListStatus } from '@/lib/project-list-status';
import { SyncAttributionService } from '@/lib/sync-attribution';
import { normaliseEmail } from '@/lib/email';
import { getEnv } from '@/lib/env';
import { log } from '@/lib/log';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
] as const;

/** Format like: Sun Feb 01 2026 00:00:00 GMT+0000 */
export function formatBitmapDateRangeBound(date: Date): string {
    const day = DAY_NAMES[date.getUTCDay()];
    const month = MONTH_NAMES[date.getUTCMonth()];
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const yyyy = date.getUTCFullYear();
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
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
    const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function hoursFromSeconds(timeSpentSeconds: number): number {
    return timeSpentSeconds / 3600;
}

export function budgetCategoryFromJobTitle(
    jobTitle: string | null | undefined,
): 'QA' | 'Development' {
    if (jobTitle && /qa/i.test(jobTitle)) {
        return 'QA';
    }
    return 'Development';
}

export function selectActiveStartedProject(
    projects: BitmapProject[],
): BitmapProject | null {
    return (
        projects.find((p) => p.state === 'active' && p.started === true) ?? null
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
                typeof b.billable_time_remaining === 'number' &&
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
            notes: params.comment ?? '',
            billable: 'true',
            nonbillable_reason: '',
        },
    };
}

/** Slim update payload matching Bitmap's PUT /timesheet_entries/:id body. */
export function buildTimesheetUpdateBody(
    body: BitmapTimesheetEntryBody,
): BitmapTimesheetEntryUpdateBody {
    const { project_id, project_budget_id, hours, notes } =
        body.timesheet_entry;
    return {
        timesheet_entry: {
            project_id,
            project_budget_id,
            hours,
            notes,
            billable: true,
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
            (user) =>
                user.full_name?.trim().toLowerCase() ===
                displayName.trim().toLowerCase(),
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

export function findMappedProject(
    projects: BitmapProject[],
    projectId: string,
): BitmapProject | null {
    return projects.find((p) => p.id === projectId) ?? null;
}

export function isProjectActiveForTimesheet(project: BitmapProject): boolean {
    return project.state === 'active' && project.started === true;
}

export function findMappedBudget(
    budgets: BitmapProjectBudget[],
    projectBudgetId: string,
): BitmapProjectBudget | null {
    return budgets.find((b) => b.id === projectBudgetId) ?? null;
}

export function isBudgetActiveForTimesheet(
    budget: BitmapProjectBudget,
): boolean {
    return (
        typeof budget.billable_time_remaining === 'number' &&
        budget.billable_time_remaining > 0
    );
}

export class BitmapResolverService {
    private readonly attribution: SyncAttributionService;

    constructor(
        private readonly userMappings: UserMappingsRepository,
        private readonly users: UsersRepository,
        private readonly userSpaceMappings: UserSpaceMappingsRepository,
        private readonly cache: ApiCacheService,
    ) {
        this.attribution = new SyncAttributionService(userMappings, users);
    }

    async resolveProjectsForClient(
        api: BitmapApiClient,
        clientId: string,
        rangeStart: string,
        rangeEnd: string,
    ): Promise<BitmapProject[]> {
        const cacheKey = projectsCacheKey(clientId, rangeStart, rangeEnd);
        const cached =
            await this.cache.getCachedJson<PaginatedResponse<BitmapProject>>(
                cacheKey,
            );
        if (cached?.data) {
            return cached.data;
        }

        const response = await api.listProjects({
            clientId,
            rangeStart,
            rangeEnd,
            page: 1,
            status: 'active',
        });

        await this.cache.setCachedJson({
            cacheKey,
            resourceType: 'projects',
            requestMeta: {
                clientId,
                rangeStart,
                rangeEnd,
                page: 1,
                status: 'active',
            },
            responseBody: response,
        });

        return response.data ?? [];
    }

    /**
     * Projects for a client filtered by Bitmap status, with no start-date window
     * (dashboard picker). Pages through results and caches under
     * projects:{clientId}:{status}.
     */
    async listProjectsForClientByStatus(
        api: BitmapApiClient,
        clientId: string,
        status: ProjectListStatus,
        options?: { forceRefresh?: boolean },
    ): Promise<BitmapProject[]> {
        const cacheKey = projectsStatusCacheKey(clientId, status);
        if (options?.forceRefresh) {
            await this.cache.deleteByKey(cacheKey);
        } else {
            const cached =
                await this.cache.getCachedJson<BitmapProject[]>(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const projects: BitmapProject[] = [];
        let page = 1;
        let totalPages = 1;
        const bitmapStatus = status === 'all' ? null : status;

        while (page <= totalPages) {
            const response = await api.listProjects({
                clientId,
                page,
                status: bitmapStatus,
            });
            projects.push(...(response.data ?? []));
            totalPages = Math.max(1, response.total_pages ?? 1);
            if (!response.next_page && page >= totalPages) break;
            page = response.next_page ?? page + 1;
            if (page > totalPages) break;
        }

        await this.cache.setCachedJson({
            cacheKey,
            resourceType: 'projects',
            requestMeta: {
                clientId,
                status,
                scope: status,
            },
            responseBody: projects,
        });

        return projects;
    }

    /** @deprecated Prefer listProjectsForClientByStatus(..., "active") */
    async listActiveProjectsForClient(
        api: BitmapApiClient,
        clientId: string,
        options?: { forceRefresh?: boolean },
    ): Promise<BitmapProject[]> {
        return this.listProjectsForClientByStatus(
            api,
            clientId,
            'active',
            options,
        );
    }

    async resolveBudgetsForProject(
        api: BitmapApiClient,
        projectId: string,
    ): Promise<BitmapProjectBudget[]> {
        const cacheKey = projectBudgetsCacheKey(projectId);
        const cached =
            await this.cache.getCachedJson<BitmapProjectBudget[]>(cacheKey);
        if (cached) {
            return cached;
        }

        const budgets = await api.listProjectBudgets(projectId);

        await this.cache.setCachedJson({
            cacheKey,
            resourceType: 'project_budgets',
            requestMeta: { projectId },
            responseBody: budgets,
        });

        return budgets;
    }

    private async resolveUserMapping(
        api: BitmapApiClient,
        input: TimesheetEntryInput,
    ): Promise<{
        bitmapUserId: string;
        jobTitle: string | null;
        bitmapEmail: string | null;
    }> {
        if (!input.authorDisplayName) {
            log.warn('bitmap-resolver', 'author_display_name_required', {
                reason: 'author_display_name_required',
                jiraWorklogId: input.jiraWorklogId,
                jiraSpaceKey: input.jiraSpaceKey,
            });
            throw new Error(
                'Worklog author displayName is required for user mapping',
            );
        }

        const existing = await this.userMappings.findByDisplayName(
            input.authorDisplayName,
        );
        if (existing) {
            if (!existing.enabled) {
                log.warn('bitmap-resolver', 'user_mapping_disabled', {
                    reason: 'user_mapping_disabled',
                    authorDisplayName: input.authorDisplayName,
                    jiraWorklogId: input.jiraWorklogId,
                    jiraSpaceKey: input.jiraSpaceKey,
                });
                throw new Error(
                    `User mapping for "${input.authorDisplayName}" is disabled`,
                );
            }
            await this.attribution.ensureAppUserIdForEmail(
                existing.bitmapEmail,
            );
            return {
                bitmapUserId: existing.bitmapUserId,
                jobTitle: existing.jobTitle,
                bitmapEmail: existing.bitmapEmail,
            };
        }

        const bitmapUser = await findBitmapUserByFullName(
            api,
            input.authorDisplayName,
        );
        if (!bitmapUser) {
            log.warn('bitmap-resolver', 'no_bitmap_user_match', {
                reason: 'no_bitmap_user_match',
                authorDisplayName: input.authorDisplayName,
                jiraWorklogId: input.jiraWorklogId,
                jiraSpaceKey: input.jiraSpaceKey,
            });
            throw new Error(
                `No Bitmap user found matching displayName "${input.authorDisplayName}"`,
            );
        }

        const inserted = await this.userMappings.upsertByDisplayName({
            jiraDisplayName: input.authorDisplayName,
            jiraAccountId: input.authorAccountId,
            bitmapUserId: bitmapUser.id,
            bitmapEmail: bitmapUser.email ?? null,
            jobTitle: bitmapUser.job_title ?? null,
            enabled: true,
        });

        log.info('bitmap-resolver', 'user_mapping_created', {
            jiraDisplayName: input.authorDisplayName,
            bitmapUserId: inserted.bitmapUserId,
            jiraWorklogId: input.jiraWorklogId,
            jiraSpaceKey: input.jiraSpaceKey,
        });

        await this.attribution.ensureAppUserIdForEmail(inserted.bitmapEmail);

        return {
            bitmapUserId: inserted.bitmapUserId,
            jobTitle: inserted.jobTitle,
            bitmapEmail: inserted.bitmapEmail,
        };
    }

    private async resolveUserSpaceOverride(
        api: BitmapApiClient,
        input: TimesheetEntryInput,
        bitmapEmail: string | null,
        rangeStart: string,
        rangeEnd: string,
    ): Promise<{ projectId: string; projectBudgetId: string } | null> {
        if (!bitmapEmail || !input.jiraSpaceKey) {
            return null;
        }

        const email = normaliseEmail(bitmapEmail);
        const appUserId = await this.users.findIdByEmailLower(email);
        if (!appUserId) {
            return null;
        }

        const mapping = await this.userSpaceMappings.findEnabledByUserAndSpace(
            appUserId,
            input.jiraSpaceKey,
        );
        if (!mapping) {
            return null;
        }

        const projects = await this.resolveProjectsForClient(
            api,
            mapping.clientId,
            rangeStart,
            rangeEnd,
        );
        const project = findMappedProject(projects, mapping.projectId);
        if (!project) {
            log.warn('bitmap-resolver', 'user_space_project_not_found', {
                reason: 'user_space_project_not_found',
                jiraSpaceKey: mapping.jiraSpaceKey,
                projectId: mapping.projectId,
                clientId: mapping.clientId,
                jiraWorklogId: input.jiraWorklogId,
            });
            throw new Error(
                `User mapping project ${mapping.projectId} not found for space ${mapping.jiraSpaceKey}`,
            );
        }
        if (!isProjectActiveForTimesheet(project)) {
            log.warn('bitmap-resolver', 'user_space_project_inactive', {
                reason: 'user_space_project_inactive',
                jiraSpaceKey: mapping.jiraSpaceKey,
                projectId: mapping.projectId,
                clientId: mapping.clientId,
                jiraWorklogId: input.jiraWorklogId,
            });
            throw new Error(
                `User mapping project ${mapping.projectId} is not active/started for space ${mapping.jiraSpaceKey}`,
            );
        }

        const budgets = await this.resolveBudgetsForProject(api, project.id);
        const budget = findMappedBudget(budgets, mapping.projectBudgetId);
        if (!budget) {
            log.warn('bitmap-resolver', 'user_space_budget_not_found', {
                reason: 'user_space_budget_not_found',
                jiraSpaceKey: mapping.jiraSpaceKey,
                projectId: project.id,
                projectBudgetId: mapping.projectBudgetId,
                jiraWorklogId: input.jiraWorklogId,
            });
            throw new Error(
                `User mapping budget ${mapping.projectBudgetId} not found on project ${project.id}`,
            );
        }
        if (!isBudgetActiveForTimesheet(budget)) {
            log.warn('bitmap-resolver', 'user_space_budget_inactive', {
                reason: 'user_space_budget_inactive',
                jiraSpaceKey: mapping.jiraSpaceKey,
                projectId: project.id,
                projectBudgetId: mapping.projectBudgetId,
                jiraWorklogId: input.jiraWorklogId,
            });
            throw new Error(
                `User mapping budget ${mapping.projectBudgetId} has no billable time remaining`,
            );
        }

        log.info('bitmap-resolver', 'user_space_override', {
            jiraSpaceKey: mapping.jiraSpaceKey,
            projectId: project.id,
            projectBudgetId: budget.id,
            jiraWorklogId: input.jiraWorklogId,
        });

        return {
            projectId: project.id,
            projectBudgetId: budget.id,
        };
    }

    async resolveTimesheetBody(
        api: BitmapApiClient,
        input: TimesheetEntryInput,
    ): Promise<BitmapTimesheetEntryBody> {
        if (input.timeSpentSeconds == null) {
            throw new Error('Worklog timeSpentSeconds is required');
        }
        if (!input.started) {
            throw new Error('Worklog started date is required');
        }

        const user = await this.resolveUserMapping(api, input);
        const { rangeStart, rangeEnd } = projectDateRangeFromStarted(
            input.started,
        );

        const override = await this.resolveUserSpaceOverride(
            api,
            input,
            user.bitmapEmail,
            rangeStart,
            rangeEnd,
        );

        if (override) {
            return buildTimesheetBody({
                userId: user.bitmapUserId,
                projectId: override.projectId,
                projectBudgetId: override.projectBudgetId,
                started: input.started,
                timeSpentSeconds: input.timeSpentSeconds,
                comment: input.comment,
            });
        }

        log.debug('bitmap-resolver', 'client_default_path', {
            clientId: input.clientId,
            jiraSpaceKey: input.jiraSpaceKey,
            jiraWorklogId: input.jiraWorklogId,
            authorDisplayName: input.authorDisplayName,
        });

        const projects = await this.resolveProjectsForClient(
            api,
            input.clientId,
            rangeStart,
            rangeEnd,
        );
        const project = selectActiveStartedProject(projects);
        if (!project) {
            log.warn('bitmap-resolver', 'no_active_project', {
                reason: 'no_active_project',
                clientId: input.clientId,
                jiraSpaceKey: input.jiraSpaceKey,
                jiraWorklogId: input.jiraWorklogId,
            });
            throw new Error(
                `No active started project found for client ${input.clientId}`,
            );
        }

        const budgets = await this.resolveBudgetsForProject(api, project.id);
        const budget = selectProjectBudget(budgets, user.jobTitle);
        if (!budget) {
            log.warn('bitmap-resolver', 'no_suitable_budget', {
                reason: 'no_suitable_budget',
                clientId: input.clientId,
                projectId: project.id,
                jobTitle: user.jobTitle,
                jiraSpaceKey: input.jiraSpaceKey,
                jiraWorklogId: input.jiraWorklogId,
            });
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

    createResolvingPmClient(options: {
        api?: BitmapApiClient;
        accessToken?: string;
        baseUrl?: string;
    }): InternalPmClient {
        const api =
            options.api ??
            createBitmapApiClient({
                accessToken: options.accessToken,
                baseUrl: options.baseUrl ?? getEnv().INTERNAL_PM_BASE_URL,
            });

        return {
            createTimesheet: async (
                input: TimesheetEntryInput,
            ): Promise<TimesheetEntryResult> => {
                const body = await this.resolveTimesheetBody(api, input);
                return api.createTimesheetEntry(body);
            },
            updateTimesheet: async (
                timesheetId: string,
                input: TimesheetEntryInput,
            ): Promise<TimesheetEntryResult> => {
                const full = await this.resolveTimesheetBody(api, input);
                return api.updateTimesheetEntry(
                    timesheetId,
                    buildTimesheetUpdateBody(full),
                );
            },
            deleteTimesheet: async (timesheetId: string): Promise<void> => {
                await api.deleteTimesheetEntry(timesheetId);
            },
        };
    }
}

export function createBitmapResolverService(db: Db = getDb()) {
    return new BitmapResolverService(
        new UserMappingsRepository(db),
        new UsersRepository(db),
        new UserSpaceMappingsRepository(db),
        createApiCacheService(db),
    );
}

/** @deprecated Prefer BitmapResolverService. */
export async function resolveProjectsForClient(
    db: Db,
    api: BitmapApiClient,
    clientId: string,
    rangeStart: string,
    rangeEnd: string,
): Promise<BitmapProject[]> {
    return createBitmapResolverService(db).resolveProjectsForClient(
        api,
        clientId,
        rangeStart,
        rangeEnd,
    );
}

/** @deprecated Prefer BitmapResolverService. */
export async function resolveBudgetsForProject(
    db: Db,
    api: BitmapApiClient,
    projectId: string,
): Promise<BitmapProjectBudget[]> {
    return createBitmapResolverService(db).resolveBudgetsForProject(
        api,
        projectId,
    );
}

/** @deprecated Prefer BitmapResolverService. */
export async function resolveTimesheetBody(
    db: Db,
    api: BitmapApiClient,
    input: TimesheetEntryInput,
): Promise<BitmapTimesheetEntryBody> {
    return createBitmapResolverService(db).resolveTimesheetBody(api, input);
}

/** @deprecated Prefer BitmapResolverService.createResolvingPmClient. */
export function createResolvingPmClient(options: {
    db: Db;
    api?: BitmapApiClient;
    accessToken?: string;
    baseUrl?: string;
}): InternalPmClient {
    return createBitmapResolverService(options.db).createResolvingPmClient(
        options,
    );
}
