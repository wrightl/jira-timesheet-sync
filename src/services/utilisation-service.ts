import type {
    BitmapApiClient,
    BitmapTimesheetEntry,
    BitmapUser,
    BitmapUserWorkingDuration,
} from '@/clients/bitmap-http';
import { getDb, type Db } from '@/db';
import { isExcludedClient } from '@/lib/excluded-clients';
import {
    isUtcWeekendIsoDate,
    utcCalendarDateRange,
    utcWeekdayDateRange,
    workingHoursForWeekdays,
} from '@/lib/weekday-hours';
import { UserMappingsRepository } from '@/repositories/user-mappings-repository';
import { TeamsRepository } from '@/repositories/teams-repository';
import {
    createSettingsService,
    type SettingsService,
} from '@/services/settings-service';

export type UtilisationPersonRow = {
    key: string;
    displayName: string;
    email: string | null;
    teamId: string | null;
    teamName: string | null;
    /** Weekly contracted hours from the latest Bitmap working duration. */
    weeklyWorkingHours: number;
    billableHours: number;
    nonBillableHours: number;
    totalHours: number;
    /** Contracted working hours scaled to the selected range. */
    workingHours: number;
    utilisationPct: number | null;
    status: 'ok' | 'watch' | 'risk' | 'under';
};

export type UtilisationUserOption = {
    id: string;
    displayName: string;
    email: string | null;
};

export type UtilisationSeriesPoint = {
    date: string;
    billableHours: number;
    workingHours: number;
    utilisationPct: number | null;
};

export type UtilisationPersonSeries = {
    key: string;
    displayName: string;
    points: UtilisationSeriesPoint[];
};

export type UtilisationProjectBreakdown = {
    projectId: string | null;
    projectName: string;
    clientId: string | null;
    clientName: string | null;
    billableHours: number;
    nonBillableHours: number;
    totalHours: number;
    pctOfTotal: number | null;
};

export type UtilisationNonBillableReason = {
    reason: string;
    hours: number;
    pctOfNonBillable: number | null;
};

export type UtilisationNonBillableProject = {
    projectId: string | null;
    projectName: string;
    clientName: string | null;
    hours: number;
    pctOfNonBillable: number | null;
    reasons: Array<{ reason: string; hours: number }>;
};

export type UtilisationResult = {
    rangeDays: number;
    targetUtilisationPct: number;
    people: UtilisationPersonRow[];
    users: UtilisationUserOption[];
    teams: Array<{ id: string; name: string; memberCount: number }>;
    series: UtilisationSeriesPoint[];
    personSeries: UtilisationPersonSeries[];
    generatedAt: string;
};

export type UtilisationPersonDetail = {
    rangeDays: number;
    targetUtilisationPct: number;
    person: UtilisationPersonRow;
    targetBillableHours: number;
    hoursToTarget: number | null;
    series: UtilisationSeriesPoint[];
    projects: UtilisationProjectBreakdown[];
    nonBillableByReason: UtilisationNonBillableReason[];
    nonBillableByProject: UtilisationNonBillableProject[];
    generatedAt: string;
};

export class UtilisationPersonNotFoundError extends Error {
    constructor(userId: string) {
        super(`Person not found: ${userId}`);
        this.name = 'UtilisationPersonNotFoundError';
    }
}

/** Bitmap full-time contracted week. */
const DEFAULT_HOURS_PER_WEEK = 37.5;

/** Billable hours as a percent of contracted working hours. */
export const TARGET_BILLABLE_UTILISATION_PCT = 80;

export const UNKNOWN_PROJECT_LABEL = 'Unknown project';
export const NO_NONBILLABLE_REASON_LABEL = 'No reason recorded';
export const TEAM_SERIES_KEY = '__team__';

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

function asWorkingDuration(raw: unknown): BitmapUserWorkingDuration | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const nested = obj.user_working_duration;
    const record =
        nested && typeof nested === 'object' && !Array.isArray(nested)
            ? (nested as Record<string, unknown>)
            : obj;
    const hours = Number(record.hours_per_week);
    return {
        id: typeof record.id === 'string' ? record.id : undefined,
        effective_from:
            typeof record.effective_from === 'string'
                ? record.effective_from
                : record.effective_from instanceof Date
                  ? record.effective_from.toISOString()
                  : null,
        hours_per_week: Number.isFinite(hours) ? hours : null,
        working_days: Array.isArray(record.working_days)
            ? record.working_days.filter(
                  (day): day is string => typeof day === 'string',
              )
            : null,
        flexible_hours:
            typeof record.flexible_hours === 'boolean'
                ? record.flexible_hours
                : null,
    };
}

function effectiveFromMs(value: string | null | undefined): number | null {
    if (!value) return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}

/**
 * Latest working-pattern alteration that has taken effect on `asOfMs`
 * (max `effective_from` that is on or before that instant).
 */
export function selectCurrentWorkingDuration(
    durations: unknown,
    asOfMs: number = Date.now(),
): BitmapUserWorkingDuration | null {
    const list = Array.isArray(durations) ? durations : [];
    let best: { duration: BitmapUserWorkingDuration; at: number } | null = null;
    for (const raw of list) {
        const duration = asWorkingDuration(raw);
        if (!duration) continue;
        const at = effectiveFromMs(duration.effective_from);
        if (at == null || at > asOfMs) continue;
        if (!best || at > best.at) best = { duration, at };
    }
    return best?.duration ?? null;
}

/**
 * Contracted weekly hours from the current `user_working_durations` row,
 * else top-level `hours_per_week`, else 37.5.
 */
export function parseWeeklyWorkingHours(
    user:
        | {
              hours_per_week?: number | null;
              user_working_durations?: unknown;
          }
        | null
        | undefined,
    asOfMs: number = Date.now(),
): number {
    const current = selectCurrentWorkingDuration(
        user?.user_working_durations,
        asOfMs,
    );
    if (current) {
        const durationHours = Number(current.hours_per_week);
        if (Number.isFinite(durationHours) && durationHours >= 0) {
            return durationHours;
        }
    }
    const hours = Number(user?.hours_per_week);
    if (Number.isFinite(hours) && hours > 0) {
        return hours;
    }
    return DEFAULT_HOURS_PER_WEEK;
}

/** Pro-rate weekly contracted hours across weekdays in the selected range. */
export function workingHoursForRange(
    weeklyHours: number,
    rangeDays: number,
    now: Date = new Date(),
): number {
    return workingHoursForWeekdays(
        weeklyHours,
        utcWeekdayDateRange(now, rangeDays).length,
    );
}

function toDateString(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/** Weekdays in the last `rangeDays` calendar days, UTC. */
export function utcDateRange(endDate: Date, rangeDays: number): string[] {
    return utcWeekdayDateRange(endDate, rangeDays);
}

export function entryDateKey(
    date: string | null | undefined,
    fallback: string,
): string {
    if (!date) return fallback;
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(date.trim());
    if (match?.[1]) return match[1];
    const ms = Date.parse(date);
    if (Number.isFinite(ms)) return new Date(ms).toISOString().slice(0, 10);
    return fallback;
}

export function clampDateToRange(dateKey: string, dates: string[]): string {
    if (dates.length === 0) return dateKey;
    const first = dates[0]!;
    const last = dates[dates.length - 1]!;
    if (dateKey < first) return first;
    if (dateKey > last) return last;
    return dateKey;
}

export function hoursToTarget(
    billableHours: number,
    workingHours: number,
    targetPct: number = TARGET_BILLABLE_UTILISATION_PCT,
): number | null {
    if (!(workingHours > 0)) return null;
    return round1((workingHours * targetPct) / 100 - billableHours);
}

export function targetBillableHours(
    workingHours: number,
    targetPct: number = TARGET_BILLABLE_UTILISATION_PCT,
): number {
    return round1((workingHours * targetPct) / 100);
}

type Acc = {
    displayName: string;
    email: string | null;
    teamId: string | null;
    teamName: string | null;
    weeklyWorkingHours: number;
    billableHours: number;
    nonBillableHours: number;
};

function personRowFromAcc(
    key: string,
    row: Acc,
    weekdayCount: number,
): UtilisationPersonRow {
    const workingHours = workingHoursForWeekdays(
        row.weeklyWorkingHours,
        weekdayCount,
    );
    const totalHours = row.billableHours + row.nonBillableHours;
    const utilisationPct =
        workingHours > 0
            ? round1((row.billableHours / workingHours) * 100)
            : null;
    return {
        key,
        displayName: row.displayName,
        email: row.email,
        teamId: row.teamId,
        teamName: row.teamName,
        weeklyWorkingHours: row.weeklyWorkingHours,
        billableHours: round1(row.billableHours),
        nonBillableHours: round1(row.nonBillableHours),
        totalHours: round1(totalHours),
        workingHours: round1(workingHours),
        utilisationPct,
        status: utilisationStatus(utilisationPct),
    };
}

function sortPeople(people: UtilisationPersonRow[]): UtilisationPersonRow[] {
    return [...people].sort((a, b) => {
        const aPct = a.utilisationPct;
        const bPct = b.utilisationPct;
        if (aPct == null && bPct == null) {
            return a.displayName.localeCompare(b.displayName);
        }
        if (aPct == null) return 1;
        if (bPct == null) return -1;
        if (bPct !== aPct) return bPct - aPct;
        return a.displayName.localeCompare(b.displayName);
    });
}

export function buildCumulativeUtilisationSeries(input: {
    dates: string[];
    people: Array<{
        key: string;
        displayName: string;
        weeklyWorkingHours: number;
        dailyBillableHours: ReadonlyMap<string, number>;
    }>;
}): {
    series: UtilisationSeriesPoint[];
    personSeries: UtilisationPersonSeries[];
} {
    const dates = input.dates.filter((date) => !isUtcWeekendIsoDate(date));
    const running = input.people.map((person) => ({
        ...person,
        cumulative: 0,
        points: [] as UtilisationSeriesPoint[],
    }));
    const series: UtilisationSeriesPoint[] = [];

    for (let index = 0; index < dates.length; index += 1) {
        const date = dates[index]!;
        let teamBillable = 0;
        let teamWorking = 0;
        for (const person of running) {
            person.cumulative += person.dailyBillableHours.get(date) ?? 0;
            const workingHours = workingHoursForWeekdays(
                person.weeklyWorkingHours,
                index + 1,
            );
            const utilisationPct =
                workingHours > 0
                    ? round1((person.cumulative / workingHours) * 100)
                    : null;
            person.points.push({
                date,
                billableHours: round1(person.cumulative),
                workingHours: round1(workingHours),
                utilisationPct,
            });
            teamBillable += person.cumulative;
            teamWorking += workingHours;
        }
        series.push({
            date,
            billableHours: round1(teamBillable),
            workingHours: round1(teamWorking),
            utilisationPct:
                teamWorking > 0
                    ? round1((teamBillable / teamWorking) * 100)
                    : null,
        });
    }

    return {
        series,
        personSeries: running.map((person) => ({
            key: person.key,
            displayName: person.displayName,
            points: person.points,
        })),
    };
}

export function aggregateProjectBreakdown(
    entries: BitmapTimesheetEntry[],
): UtilisationProjectBreakdown[] {
    const byKey = new Map<
        string,
        {
            projectId: string | null;
            projectName: string;
            clientId: string | null;
            clientName: string | null;
            billableHours: number;
            nonBillableHours: number;
        }
    >();

    for (const entry of entries) {
        if (!isCountableTimesheetEntry(entry)) continue;
        if (isExcludedClient(entry.project?.client)) continue;
        if (isUtcWeekendIsoDate(entry.date)) continue;
        const hours = typeof entry.hours === 'number' ? entry.hours : 0;
        if (!Number.isFinite(hours) || hours <= 0) continue;
        const flag = timesheetBillableFlag(entry.billable);
        if (flag !== true && flag !== false) continue;

        const projectId = entry.project?.id ?? null;
        const projectName =
            entry.project?.name?.trim() || UNKNOWN_PROJECT_LABEL;
        const clientId = entry.project?.client?.id ?? null;
        const clientName = entry.project?.client?.name?.trim() || null;
        const key = projectId ?? `name:${projectName}`;
        let row = byKey.get(key);
        if (!row) {
            row = {
                projectId,
                projectName,
                clientId,
                clientName,
                billableHours: 0,
                nonBillableHours: 0,
            };
            byKey.set(key, row);
        }
        if (flag === true) row.billableHours += hours;
        else row.nonBillableHours += hours;
    }

    const rows = [...byKey.values()].map((row) => ({
        ...row,
        totalHours: row.billableHours + row.nonBillableHours,
    }));
    const grand = rows.reduce((sum, row) => sum + row.totalHours, 0);

    return rows
        .map((row) => ({
            projectId: row.projectId,
            projectName: row.projectName,
            clientId: row.clientId,
            clientName: row.clientName,
            billableHours: round1(row.billableHours),
            nonBillableHours: round1(row.nonBillableHours),
            totalHours: round1(row.totalHours),
            pctOfTotal:
                grand > 0 ? round1((row.totalHours / grand) * 100) : null,
        }))
        .sort((a, b) => {
            if (b.totalHours !== a.totalHours) return b.totalHours - a.totalHours;
            return a.projectName.localeCompare(b.projectName);
        });
}

export function aggregateNonBillable(entries: BitmapTimesheetEntry[]): {
    byReason: UtilisationNonBillableReason[];
    byProject: UtilisationNonBillableProject[];
} {
    const reasonHours = new Map<string, number>();
    const projectHours = new Map<
        string,
        {
            projectId: string | null;
            projectName: string;
            clientName: string | null;
            hours: number;
            reasons: Map<string, number>;
        }
    >();

    for (const entry of entries) {
        if (!isCountableTimesheetEntry(entry)) continue;
        if (isExcludedClient(entry.project?.client)) continue;
        if (isUtcWeekendIsoDate(entry.date)) continue;
        if (timesheetBillableFlag(entry.billable) !== false) continue;
        const hours = typeof entry.hours === 'number' ? entry.hours : 0;
        if (!Number.isFinite(hours) || hours <= 0) continue;

        const reason =
            entry.nonbillable_reason?.trim() || NO_NONBILLABLE_REASON_LABEL;
        reasonHours.set(reason, (reasonHours.get(reason) ?? 0) + hours);

        const projectId = entry.project?.id ?? null;
        const projectName =
            entry.project?.name?.trim() || UNKNOWN_PROJECT_LABEL;
        const clientName = entry.project?.client?.name?.trim() || null;
        const projectKey = projectId ?? `name:${projectName}`;
        let project = projectHours.get(projectKey);
        if (!project) {
            project = {
                projectId,
                projectName,
                clientName,
                hours: 0,
                reasons: new Map(),
            };
            projectHours.set(projectKey, project);
        }
        project.hours += hours;
        project.reasons.set(reason, (project.reasons.get(reason) ?? 0) + hours);
    }

    const total = [...reasonHours.values()].reduce((sum, hours) => sum + hours, 0);
    const pct = (hours: number) =>
        total > 0 ? round1((hours / total) * 100) : null;

    const byReason = [...reasonHours.entries()]
        .map(([reason, hours]) => ({
            reason,
            hours: round1(hours),
            pctOfNonBillable: pct(hours),
        }))
        .sort((a, b) => {
            if (b.hours !== a.hours) return b.hours - a.hours;
            return a.reason.localeCompare(b.reason);
        });

    const byProject = [...projectHours.values()]
        .map((project) => ({
            projectId: project.projectId,
            projectName: project.projectName,
            clientName: project.clientName,
            hours: round1(project.hours),
            pctOfNonBillable: pct(project.hours),
            reasons: [...project.reasons.entries()]
                .map(([reason, hours]) => ({
                    reason,
                    hours: round1(hours),
                }))
                .sort((a, b) => {
                    if (b.hours !== a.hours) return b.hours - a.hours;
                    return a.reason.localeCompare(b.reason);
                }),
        }))
        .sort((a, b) => {
            if (b.hours !== a.hours) return b.hours - a.hours;
            return a.projectName.localeCompare(b.projectName);
        });

    return { byReason, byProject };
}

/** Planned allocations and rejected entries must not inflate billable utilisation. */
export function isCountableTimesheetEntry(
    entry: BitmapTimesheetEntry,
): boolean {
    const state = entry.state?.toLowerCase() ?? '';
    return state !== 'planned' && state !== 'rejected';
}

/** Bitmap may send a boolean or a JSON string. */
export function timesheetBillableFlag(billable: unknown): boolean | null {
    if (billable === true || billable === 1 || billable === 'true') return true;
    if (billable === false || billable === 0 || billable === 'false')
        return false;
    return null;
}

function asBitmapUser(raw: unknown): BitmapUser | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const nested = obj.user;
    const record =
        nested && typeof nested === 'object' && !Array.isArray(nested)
            ? (nested as Record<string, unknown>)
            : obj;
    const id = record.id;
    if (typeof id !== 'string' || id.length === 0) return null;
    return {
        id,
        full_name: typeof record.full_name === 'string' ? record.full_name : '',
        email: typeof record.email === 'string' ? record.email : null,
        hours_per_week: Number.isFinite(Number(record.hours_per_week))
            ? Number(record.hours_per_week)
            : null,
        billable_target_hours:
            typeof record.billable_target_hours === 'number'
                ? record.billable_target_hours
                : null,
        user_working_durations: Array.isArray(record.user_working_durations)
            ? record.user_working_durations
            : [],
    };
}

/** Percent of contracted working hours that were billable: under &lt;50, watch 50–79, ok 80–109, risk ≥110. */
export function utilisationStatus(
    utilisationPct: number | null,
): UtilisationPersonRow['status'] {
    if (utilisationPct == null) return 'ok';
    if (utilisationPct >= 110) return 'risk';
    if (utilisationPct < 50) return 'under';
    if (utilisationPct < 80) return 'watch';
    return 'ok';
}

async function listAllBitmapUsers(api: BitmapApiClient): Promise<BitmapUser[]> {
    const users: BitmapUser[] = [];
    let page = 1;
    const maxPages = 50;

    while (page <= maxPages) {
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

type UtilisationSnapshot = UtilisationResult & {
    entriesByUser: Map<string, BitmapTimesheetEntry[]>;
};

export class UtilisationService {
    constructor(
        private readonly mappings: UserMappingsRepository,
        private readonly teams: TeamsRepository,
        private readonly settings: SettingsService,
    ) {}

    async getUtilisation(options?: {
        rangeDays?: number;
        teamId?: string | null;
        userId?: string | null;
    }): Promise<UtilisationResult> {
        const { entriesByUser: _entriesByUser, ...result } =
            await this.loadSnapshot(options);
        return result;
    }

    private async loadSnapshot(options?: {
        rangeDays?: number;
        teamId?: string | null;
        userId?: string | null;
    }): Promise<UtilisationSnapshot> {
        const rangeDays = Math.min(Math.max(options?.rangeDays ?? 7, 1), 90);
        const userId = options?.userId?.trim() || null;
        const endDate = new Date();
        const calendarDates = utcCalendarDateRange(endDate, rangeDays);
        const dates = utcWeekdayDateRange(endDate, rangeDays);
        const startKey = calendarDates[0] ?? dates[0];
        const startDate = new Date(`${startKey}T00:00:00.000Z`);

        const tokenOk = await this.settings.isTokenConfigured();
        if (!tokenOk) {
            throw new Error('Bitmap access token is not configured');
        }

        const bitmap: BitmapApiClient =
            await this.settings.createConfiguredBitmapClient();

        const [mappingRows, teamRows, members, allMembers, bitmapUsers] =
            await Promise.all([
                this.mappings.list(),
                this.teams.listTeams(),
                this.teams.listMembers(options?.teamId ?? undefined),
                this.teams.listMembers(),
                listAllBitmapUsers(bitmap),
            ]);

        const teamNameById = new Map(teamRows.map((t) => [t.id, t.name]));
        const mappingById = new Map(mappingRows.map((m) => [m.id, m]));
        const mappingByBitmapUserId = new Map(
            mappingRows.map((m) => [m.bitmapUserId, m]),
        );
        const bitmapUserById = new Map(bitmapUsers.map((u) => [u.id, u]));

        const usersById = new Map<string, UtilisationUserOption>();
        for (const user of bitmapUsers) {
            usersById.set(user.id, {
                id: user.id,
                displayName: user.full_name || user.email || user.id,
                email: user.email ?? null,
            });
        }
        for (const mapping of mappingRows) {
            if (!mapping.bitmapUserId || usersById.has(mapping.bitmapUserId)) {
                continue;
            }
            usersById.set(mapping.bitmapUserId, {
                id: mapping.bitmapUserId,
                displayName: mapping.jiraDisplayName,
                email: mapping.bitmapEmail ?? null,
            });
        }
        const users = [...usersById.values()].sort((a, b) =>
            a.displayName.localeCompare(b.displayName),
        );

        const byKey = new Map<string, Acc>();
        const dailyBillable = new Map<string, Map<string, number>>();
        const entriesByUser = new Map<string, BitmapTimesheetEntry[]>();

        const weeklyHoursFor = (
            bitmapUserId: string | null | undefined,
        ): number => {
            if (!bitmapUserId) return DEFAULT_HOURS_PER_WEEK;
            return parseWeeklyWorkingHours(
                bitmapUserById.get(bitmapUserId),
                endDate.getTime(),
            );
        };

        const ensure = (
            key: string,
            seed: Partial<Acc> & { displayName: string },
        ): Acc => {
            let row = byKey.get(key);
            if (!row) {
                row = {
                    displayName: seed.displayName,
                    email: seed.email ?? null,
                    teamId: seed.teamId ?? null,
                    teamName: seed.teamName ?? null,
                    weeklyWorkingHours:
                        seed.weeklyWorkingHours ?? DEFAULT_HOURS_PER_WEEK,
                    billableHours: 0,
                    nonBillableHours: 0,
                };
                byKey.set(key, row);
            }
            return row;
        };

        for (const member of members) {
            const mapping = member.userMappingId
                ? mappingById.get(member.userMappingId)
                : null;
            const bitmapUserId = mapping?.bitmapUserId ?? null;
            if (userId && bitmapUserId !== userId) continue;
            const bitmapUser = bitmapUserId
                ? bitmapUserById.get(bitmapUserId)
                : undefined;
            const key =
                bitmapUserId ?? member.appUserId ?? mapping?.id ?? member.id;
            ensure(key, {
                displayName:
                    member.displayName ??
                    bitmapUser?.full_name ??
                    mapping?.jiraDisplayName ??
                    'Unknown',
                email: mapping?.bitmapEmail ?? bitmapUser?.email ?? null,
                teamId: member.teamId,
                teamName: teamNameById.get(member.teamId) ?? null,
                weeklyWorkingHours: weeklyHoursFor(bitmapUserId),
            });
        }

        if (userId) {
            const bitmapUser = bitmapUserById.get(userId);
            const mapping = mappingByBitmapUserId.get(userId) ?? null;
            const member = members.find(
                (m) => mapping != null && m.userMappingId === mapping.id,
            );
            if (!options?.teamId || member) {
                ensure(userId, {
                    displayName:
                        member?.displayName ??
                        bitmapUser?.full_name ??
                        mapping?.jiraDisplayName ??
                        usersById.get(userId)?.displayName ??
                        'Unknown',
                    email: mapping?.bitmapEmail ?? bitmapUser?.email ?? null,
                    teamId: member?.teamId ?? null,
                    teamName: member
                        ? (teamNameById.get(member.teamId) ?? null)
                        : null,
                    weeklyWorkingHours: weeklyHoursFor(userId),
                });
            }
        }

        let bitmapUserIdsForFilter: string[] | undefined;
        if (userId) {
            bitmapUserIdsForFilter = [userId];
        } else if (options?.teamId) {
            bitmapUserIdsForFilter = [
                ...new Set(
                    members
                        .map((m) =>
                            m.userMappingId
                                ? mappingById.get(m.userMappingId)?.bitmapUserId
                                : null,
                        )
                        .filter((id): id is string => Boolean(id)),
                ),
            ];
        }

        const shouldFetch =
            bitmapUserIdsForFilter == null || bitmapUserIdsForFilter.length > 0;

        let entries: BitmapTimesheetEntry[] = [];
        if (shouldFetch) {
            entries = await bitmap.listTimesheetEntries({
                startDate: toDateString(startDate),
                endDate: toDateString(endDate),
                userIds: bitmapUserIdsForFilter,
            });
        }

        for (const entry of entries) {
            if (!isCountableTimesheetEntry(entry)) continue;
            if (isExcludedClient(entry.project?.client)) continue;
            if (isUtcWeekendIsoDate(entry.date)) continue;
            const hours = typeof entry.hours === 'number' ? entry.hours : 0;
            if (!Number.isFinite(hours) || hours <= 0) continue;
            const bitmapUserId = entry.user?.id;
            if (!bitmapUserId) continue;
            if (userId && bitmapUserId !== userId) continue;

            const mapping = mappingByBitmapUserId.get(bitmapUserId) ?? null;
            const bitmapUser = bitmapUserById.get(bitmapUserId);
            const member = members.find(
                (m) => mapping != null && m.userMappingId === mapping.id,
            );

            if (options?.teamId && !member) continue;

            const key = bitmapUserId;
            ensure(key, {
                displayName:
                    member?.displayName ??
                    entry.user?.full_name ??
                    bitmapUser?.full_name ??
                    mapping?.jiraDisplayName ??
                    'Unknown',
                email: mapping?.bitmapEmail ?? bitmapUser?.email ?? null,
                teamId: member?.teamId ?? null,
                teamName: member
                    ? (teamNameById.get(member.teamId) ?? null)
                    : null,
                weeklyWorkingHours: weeklyHoursFor(bitmapUserId),
            });

            const row = byKey.get(key)!;
            const billableFlag = timesheetBillableFlag(entry.billable);
            if (billableFlag === true) {
                row.billableHours += hours;
                const dateKey = clampDateToRange(
                    entryDateKey(
                        entry.date,
                        dates[dates.length - 1] ?? toDateString(endDate),
                    ),
                    dates,
                );
                let byDate = dailyBillable.get(key);
                if (!byDate) {
                    byDate = new Map();
                    dailyBillable.set(key, byDate);
                }
                byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + hours);
            } else if (billableFlag === false) {
                row.nonBillableHours += hours;
            }

            let userEntries = entriesByUser.get(key);
            if (!userEntries) {
                userEntries = [];
                entriesByUser.set(key, userEntries);
            }
            userEntries.push(entry);
        }

        const people = sortPeople(
            [...byKey.entries()].map(([key, row]) =>
                personRowFromAcc(key, row, dates.length),
            ),
        );
        const { series, personSeries } = buildCumulativeUtilisationSeries({
            dates,
            people: people.map((person) => ({
                key: person.key,
                displayName: person.displayName,
                weeklyWorkingHours: person.weeklyWorkingHours,
                dailyBillableHours: dailyBillable.get(person.key) ?? new Map(),
            })),
        });

        return {
            rangeDays,
            targetUtilisationPct: TARGET_BILLABLE_UTILISATION_PCT,
            people,
            users,
            teams: teamRows.map((t) => ({
                id: t.id,
                name: t.name,
                memberCount: allMembers.filter((m) => m.teamId === t.id).length,
            })),
            series,
            personSeries,
            generatedAt: new Date().toISOString(),
            entriesByUser,
        };
    }

    async getPersonDetail(options: {
        userId: string;
        rangeDays?: number;
    }): Promise<UtilisationPersonDetail> {
        const userId = options.userId.trim();
        if (!userId) {
            throw new UtilisationPersonNotFoundError(userId);
        }

        const snapshot = await this.loadSnapshot({
            rangeDays: options.rangeDays,
            userId,
        });
        const known = snapshot.users.some((user) => user.id === userId);
        if (!known) {
            throw new UtilisationPersonNotFoundError(userId);
        }

        const person =
            snapshot.people.find((row) => row.key === userId) ??
            personRowFromAcc(
                userId,
                {
                    displayName:
                        snapshot.users.find((user) => user.id === userId)
                            ?.displayName ?? 'Unknown',
                    email:
                        snapshot.users.find((user) => user.id === userId)
                            ?.email ?? null,
                    teamId: null,
                    teamName: null,
                    weeklyWorkingHours: DEFAULT_HOURS_PER_WEEK,
                    billableHours: 0,
                    nonBillableHours: 0,
                },
                snapshot.series.length,
            );

        const entries = snapshot.entriesByUser.get(userId) ?? [];
        const personSeries =
            snapshot.personSeries.find((row) => row.key === userId)?.points ??
            snapshot.series;
        const nonBillable = aggregateNonBillable(entries);

        return {
            rangeDays: snapshot.rangeDays,
            targetUtilisationPct: TARGET_BILLABLE_UTILISATION_PCT,
            person,
            targetBillableHours: targetBillableHours(person.workingHours),
            hoursToTarget: hoursToTarget(
                person.billableHours,
                person.workingHours,
            ),
            series: personSeries,
            projects: aggregateProjectBreakdown(entries),
            nonBillableByReason: nonBillable.byReason,
            nonBillableByProject: nonBillable.byProject,
            generatedAt: snapshot.generatedAt,
        };
    }
}

export function createUtilisationService(db: Db = getDb()) {
    return new UtilisationService(
        new UserMappingsRepository(db),
        new TeamsRepository(db),
        createSettingsService(db),
    );
}
