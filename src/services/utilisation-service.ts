import type {
    BitmapApiClient,
    BitmapTimesheetEntry,
    BitmapUser,
    BitmapUserWorkingDuration,
} from '@/clients/bitmap-http';
import { getDb, type Db } from '@/db';
import { isExcludedClient } from '@/lib/excluded-clients';
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

export type UtilisationResult = {
    rangeDays: number;
    people: UtilisationPersonRow[];
    users: UtilisationUserOption[];
    teams: Array<{ id: string; name: string; memberCount: number }>;
    generatedAt: string;
};

/** Bitmap full-time contracted week. */
const DEFAULT_HOURS_PER_WEEK = 37.5;

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

/** Pro-rate weekly contracted hours across the selected calendar range. */
export function workingHoursForRange(
    weeklyHours: number,
    rangeDays: number,
): number {
    return weeklyHours * (rangeDays / 7);
}

function toDateString(d: Date): string {
    return d.toISOString().slice(0, 10);
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
        const rangeDays = Math.min(Math.max(options?.rangeDays ?? 7, 1), 90);
        const userId = options?.userId?.trim() || null;
        const endDate = new Date();
        const startDate = new Date(
            endDate.getTime() - (rangeDays - 1) * 24 * 60 * 60 * 1000,
        );

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

        type Acc = {
            displayName: string;
            email: string | null;
            teamId: string | null;
            teamName: string | null;
            weeklyWorkingHours: number;
            billableHours: number;
            nonBillableHours: number;
        };

        const byKey = new Map<string, Acc>();

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
            } else if (billableFlag === false) {
                row.nonBillableHours += hours;
            }
        }

        const people: UtilisationPersonRow[] = [...byKey.entries()]
            .map(([key, row]) => {
                const workingHours = workingHoursForRange(
                    row.weeklyWorkingHours,
                    rangeDays,
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
            })
            .sort((a, b) => {
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

        return {
            rangeDays,
            people,
            users,
            teams: teamRows.map((t) => ({
                id: t.id,
                name: t.name,
                memberCount: allMembers.filter((m) => m.teamId === t.id).length,
            })),
            generatedAt: new Date().toISOString(),
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
