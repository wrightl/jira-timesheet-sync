import { getDb, type Db } from "@/db";
import { parseWorklogWebhookPayload } from "@/lib/worklog-parser";
import { UserMappingsRepository } from "@/repositories/user-mappings-repository";
import { TeamsRepository } from "@/repositories/teams-repository";
import { gte } from "drizzle-orm";
import { worklogSyncs } from "@/db/schema";

export type UtilizationPersonRow = {
  key: string;
  displayName: string;
  email: string | null;
  teamId: string | null;
  teamName: string | null;
  weeklyCapacityHours: number;
  loggedHours: number;
  syncedHours: number;
  failedHours: number;
  skippedHours: number;
  utilizationPct: number | null;
  status: "ok" | "watch" | "risk" | "under";
  spaces: Array<{ spaceKey: string | null; hours: number }>;
};

export type UtilizationResult = {
  rangeDays: number;
  expectedCapacityHours: number;
  people: UtilizationPersonRow[];
  teams: Array<{ id: string; name: string; memberCount: number }>;
  generatedAt: string;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function parseCapacity(raw: string | null | undefined): number {
  const n = Number(raw ?? 40);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

function hoursFromSync(rawPayload: string | null | undefined): number {
  if (!rawPayload) return 0;
  try {
    const parsed = parseWorklogWebhookPayload(JSON.parse(rawPayload));
    if (!parsed?.timeSpentSeconds || parsed.timeSpentSeconds <= 0) return 0;
    if (parsed.eventType === "worklog_deleted") return 0;
    return parsed.timeSpentSeconds / 3600;
  } catch {
    return 0;
  }
}

export class UtilizationService {
  constructor(
    private readonly db: Db,
    private readonly mappings: UserMappingsRepository,
    private readonly teams: TeamsRepository,
  ) {}

  async getUtilization(options?: {
    rangeDays?: number;
    teamId?: string | null;
  }): Promise<UtilizationResult> {
    const rangeDays = Math.min(Math.max(options?.rangeDays ?? 7, 1), 90);
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    const weeks = rangeDays / 7;

    const [syncRows, mappingRows, teamRows, memberRows] = await Promise.all([
      this.db
        .select()
        .from(worklogSyncs)
        .where(
          gte(worklogSyncs.createdAt, since),
        ),
      this.mappings.list(),
      this.teams.listTeams(),
      this.teams.listMembers(options?.teamId ?? undefined),
    ]);

    // If team filter set, only members of that team; otherwise all members + unmapped authors
    const members = options?.teamId
      ? memberRows
      : await this.teams.listMembers();

    const teamNameById = new Map(teamRows.map((t) => [t.id, t.name]));
    const mappingByAccount = new Map(
      mappingRows
        .filter((m) => m.jiraAccountId)
        .map((m) => [m.jiraAccountId!, m]),
    );
    const mappingByName = new Map(
      mappingRows.map((m) => [m.jiraDisplayName.toLowerCase(), m]),
    );
    const mappingById = new Map(mappingRows.map((m) => [m.id, m]));

    type Acc = {
      displayName: string;
      email: string | null;
      teamId: string | null;
      teamName: string | null;
      weeklyCapacityHours: number;
      loggedHours: number;
      syncedHours: number;
      failedHours: number;
      skippedHours: number;
      spaces: Map<string, number>;
    };

    const byKey = new Map<string, Acc>();

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
          weeklyCapacityHours: seed.weeklyCapacityHours ?? 40,
          loggedHours: 0,
          syncedHours: 0,
          failedHours: 0,
          skippedHours: 0,
          spaces: new Map(),
        };
        byKey.set(key, row);
      }
      return row;
    };

    for (const member of members) {
      const mapping = member.userMappingId
        ? mappingById.get(member.userMappingId)
        : null;
      const key =
        member.appUserId ??
        mapping?.jiraAccountId ??
        mapping?.id ??
        member.id;
      ensure(key, {
        displayName:
          member.displayName ??
          mapping?.jiraDisplayName ??
          "Unknown",
        email: mapping?.bitmapEmail ?? null,
        teamId: member.teamId,
        teamName: teamNameById.get(member.teamId) ?? null,
        weeklyCapacityHours: parseCapacity(member.weeklyCapacityHours),
      });
    }

    for (const sync of syncRows) {
      if (
        sync.eventType !== "worklog_created" &&
        sync.eventType !== "worklog_updated"
      ) {
        continue;
      }
      const hours = hoursFromSync(sync.rawPayload);
      if (hours <= 0) continue;

      const mapping =
        (sync.authorAccountId
          ? mappingByAccount.get(sync.authorAccountId)
          : null) ??
        (sync.authorDisplayName
          ? mappingByName.get(sync.authorDisplayName.toLowerCase())
          : null);

      const member = members.find(
        (m) =>
          (sync.appUserId && m.appUserId === sync.appUserId) ||
          (mapping && m.userMappingId === mapping.id),
      );

      if (options?.teamId && !member) continue;

      const key =
        sync.appUserId ??
        sync.authorAccountId ??
        mapping?.id ??
        sync.authorDisplayName ??
        "unknown";

      const row = ensure(key, {
        displayName:
          member?.displayName ??
          sync.authorDisplayName ??
          mapping?.jiraDisplayName ??
          "Unknown",
        email: mapping?.bitmapEmail ?? null,
        teamId: member?.teamId ?? null,
        teamName: member
          ? teamNameById.get(member.teamId) ?? null
          : null,
        weeklyCapacityHours: parseCapacity(member?.weeklyCapacityHours),
      });

      row.loggedHours += hours;
      if (sync.status === "synced") row.syncedHours += hours;
      if (sync.status === "failed") row.failedHours += hours;
      if (sync.status === "skipped") row.skippedHours += hours;

      const space = sync.jiraSpaceId ?? "unknown";
      row.spaces.set(space, (row.spaces.get(space) ?? 0) + hours);
    }

    const expectedCapacityHours = 40; // reported per-person via weeklyCapacity
    const people: UtilizationPersonRow[] = [...byKey.entries()]
      .map(([key, row]) => {
        const capacity = row.weeklyCapacityHours * weeks;
        const utilizationPct =
          capacity > 0 ? round1((row.loggedHours / capacity) * 100) : null;
        let status: UtilizationPersonRow["status"] = "ok";
        if (utilizationPct != null) {
          if (utilizationPct >= 110) status = "risk";
          else if (utilizationPct >= 95) status = "watch";
          else if (utilizationPct < 50) status = "under";
        }
        return {
          key,
          displayName: row.displayName,
          email: row.email,
          teamId: row.teamId,
          teamName: row.teamName,
          weeklyCapacityHours: row.weeklyCapacityHours,
          loggedHours: round1(row.loggedHours),
          syncedHours: round1(row.syncedHours),
          failedHours: round1(row.failedHours),
          skippedHours: round1(row.skippedHours),
          utilizationPct,
          status,
          spaces: [...row.spaces.entries()]
            .map(([spaceKey, h]) => ({
              spaceKey: spaceKey === "unknown" ? null : spaceKey,
              hours: round1(h),
            }))
            .sort((a, b) => b.hours - a.hours),
        };
      })
      .sort((a, b) => b.loggedHours - a.loggedHours);

    return {
      rangeDays,
      expectedCapacityHours,
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

export function createUtilizationService(db: Db = getDb()) {
  return new UtilizationService(
    db,
    new UserMappingsRepository(db),
    new TeamsRepository(db),
  );
}
