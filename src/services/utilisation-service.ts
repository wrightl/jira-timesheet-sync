import type {
  BitmapApiClient,
  BitmapTimesheetEntry,
  BitmapUser,
} from "@/clients/bitmap-http";
import { getDb, type Db } from "@/db";
import { isExcludedClient } from "@/lib/excluded-clients";
import { UserMappingsRepository } from "@/repositories/user-mappings-repository";
import { TeamsRepository } from "@/repositories/teams-repository";
import {
  createSettingsService,
  type SettingsService,
} from "@/services/settings-service";

export type UtilisationPersonRow = {
  key: string;
  displayName: string;
  email: string | null;
  teamId: string | null;
  teamName: string | null;
  /** Weekly Bitmap billable_target_hours. */
  weeklyBillableTargetHours: number;
  billableHours: number;
  nonBillableHours: number;
  totalHours: number;
  /** billable_target_hours scaled to the selected range. */
  targetHours: number;
  utilisationPct: number | null;
  status: "ok" | "watch" | "risk" | "under";
};

export type UtilisationResult = {
  rangeDays: number;
  expectedTargetHours: number;
  people: UtilisationPersonRow[];
  teams: Array<{ id: string; name: string; memberCount: number }>;
  generatedAt: string;
};

/** Bitmap full-time default: 37.5h × 80% billable target. */
const DEFAULT_BILLABLE_TARGET_HOURS = 30;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Prefer Bitmap billable_target_hours; fall back to hours_per_week × 0.8,
 * then the full-time default.
 */
export function parseBillableTargetHours(user: {
  billable_target_hours?: number | null;
  hours_per_week?: number | null;
} | null | undefined): number {
  const target = user?.billable_target_hours;
  if (typeof target === "number" && Number.isFinite(target) && target > 0) {
    return target;
  }
  const hours = user?.hours_per_week;
  if (typeof hours === "number" && Number.isFinite(hours) && hours > 0) {
    return hours * 0.8;
  }
  return DEFAULT_BILLABLE_TARGET_HOURS;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Planned allocations and rejected entries must not inflate billable utilisation. */
export function isCountableTimesheetEntry(
  entry: BitmapTimesheetEntry,
): boolean {
  const state = entry.state?.toLowerCase() ?? "";
  return state !== "planned" && state !== "rejected";
}

/** Percent of billable target: under &lt;50, watch 50–79, ok 80–109, risk ≥110. */
export function utilisationStatus(
  utilisationPct: number | null,
): UtilisationPersonRow["status"] {
  if (utilisationPct == null) return "ok";
  if (utilisationPct >= 110) return "risk";
  if (utilisationPct < 50) return "under";
  if (utilisationPct < 80) return "watch";
  return "ok";
}

async function listAllBitmapUsers(
  api: BitmapApiClient,
): Promise<BitmapUser[]> {
  const users: BitmapUser[] = [];
  let page = 1;
  const maxPages = 50;

  while (page <= maxPages) {
    const response = await api.listUsers(page);
    users.push(...(response.data ?? []));
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
  }): Promise<UtilisationResult> {
    const rangeDays = Math.min(Math.max(options?.rangeDays ?? 7, 1), 90);
    const weeks = rangeDays / 7;
    const endDate = new Date();
    const startDate = new Date(
      endDate.getTime() - rangeDays * 24 * 60 * 60 * 1000,
    );

    const tokenOk = await this.settings.isTokenConfigured();
    if (!tokenOk) {
      throw new Error("Bitmap access token is not configured");
    }

    const bitmap: BitmapApiClient =
      await this.settings.createConfiguredBitmapClient();

    const [mappingRows, teamRows, members, bitmapUsers] = await Promise.all([
      this.mappings.list(),
      this.teams.listTeams(),
      this.teams.listMembers(options?.teamId ?? undefined),
      listAllBitmapUsers(bitmap),
    ]);

    const teamNameById = new Map(teamRows.map((t) => [t.id, t.name]));
    const mappingById = new Map(mappingRows.map((m) => [m.id, m]));
    const mappingByBitmapUserId = new Map(
      mappingRows.map((m) => [m.bitmapUserId, m]),
    );
    const bitmapUserById = new Map(bitmapUsers.map((u) => [u.id, u]));

    type Acc = {
      displayName: string;
      email: string | null;
      teamId: string | null;
      teamName: string | null;
      weeklyBillableTargetHours: number;
      billableHours: number;
      nonBillableHours: number;
    };

    const byKey = new Map<string, Acc>();

    const targetFor = (bitmapUserId: string | null | undefined): number => {
      if (!bitmapUserId) return DEFAULT_BILLABLE_TARGET_HOURS;
      return parseBillableTargetHours(bitmapUserById.get(bitmapUserId));
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
          weeklyBillableTargetHours:
            seed.weeklyBillableTargetHours ?? DEFAULT_BILLABLE_TARGET_HOURS,
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
          "Unknown",
        email: mapping?.bitmapEmail ?? bitmapUser?.email ?? null,
        teamId: member.teamId,
        teamName: teamNameById.get(member.teamId) ?? null,
        weeklyBillableTargetHours: targetFor(bitmapUserId),
      });
    }

    const bitmapUserIdsForFilter = options?.teamId
      ? [
          ...new Set(
            members
              .map((m) =>
                m.userMappingId
                  ? mappingById.get(m.userMappingId)?.bitmapUserId
                  : null,
              )
              .filter((id): id is string => Boolean(id)),
          ),
        ]
      : undefined;

    // Team filter with no mapped Bitmap users → empty hours, still show roster
    const shouldFetch =
      !options?.teamId ||
      (bitmapUserIdsForFilter != null && bitmapUserIdsForFilter.length > 0);

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
      const hours = typeof entry.hours === "number" ? entry.hours : 0;
      if (!Number.isFinite(hours) || hours <= 0) continue;

      const bitmapUserId = entry.user?.id;
      if (!bitmapUserId) continue;

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
          "Unknown",
        email: mapping?.bitmapEmail ?? bitmapUser?.email ?? null,
        teamId: member?.teamId ?? null,
        teamName: member
          ? (teamNameById.get(member.teamId) ?? null)
          : null,
        weeklyBillableTargetHours: targetFor(bitmapUserId),
      });

      const row = byKey.get(key)!;
      if (entry.billable === true) {
        row.billableHours += hours;
      } else {
        row.nonBillableHours += hours;
      }
    }

    const people: UtilisationPersonRow[] = [...byKey.entries()]
      .map(([key, row]) => {
        const targetHours = row.weeklyBillableTargetHours * weeks;
        const totalHours = row.billableHours + row.nonBillableHours;
        const utilisationPct =
          targetHours > 0
            ? round1((row.billableHours / targetHours) * 100)
            : null;
        return {
          key,
          displayName: row.displayName,
          email: row.email,
          teamId: row.teamId,
          teamName: row.teamName,
          weeklyBillableTargetHours: row.weeklyBillableTargetHours,
          billableHours: round1(row.billableHours),
          nonBillableHours: round1(row.nonBillableHours),
          totalHours: round1(totalHours),
          targetHours: round1(targetHours),
          utilisationPct,
          status: utilisationStatus(utilisationPct),
        };
      })
      .sort((a, b) => b.billableHours - a.billableHours);

    return {
      rangeDays,
      expectedTargetHours: DEFAULT_BILLABLE_TARGET_HOURS,
      people,
      teams: teamRows.map((t) => ({
        id: t.id,
        name: t.name,
        memberCount: members.filter((m) => m.teamId === t.id).length,
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
