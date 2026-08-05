import { getDb, type Db } from "@/db";
import { WorklogSyncsRepository } from "@/repositories/worklog-syncs-repository";
import { SpaceProjectMappingsRepository } from "@/repositories/space-project-mappings-repository";
import { UserMappingsRepository } from "@/repositories/user-mappings-repository";
import { UserSpaceMappingsRepository } from "@/repositories/user-space-mappings-repository";
import { SettingsRepository } from "@/repositories/settings-repository";
import { withDbRetry } from "@/lib/db-retry";
import { createSyncAttributionService } from "@/lib/sync-attribution";
import { createSettingsService } from "@/services/settings-service";
import {
  assembleDashboardStats,
  DEFAULT_DASHBOARD_RANGE,
  mappingCountsFromRows,
  rangeSince,
  volumeGranularity,
  type AdminConfigStats,
  type DashboardRange,
  type DashboardScope,
  type DashboardStats,
  type UserConfigStats,
} from "@/lib/dashboard-shared";

export * from "@/lib/dashboard-shared";

export class DashboardStatsService {
  constructor(
    private readonly syncs: WorklogSyncsRepository,
    private readonly spaceMappings: SpaceProjectMappingsRepository,
    private readonly userMappings: UserMappingsRepository,
    private readonly userSpaceMappings: UserSpaceMappingsRepository,
    private readonly settings: SettingsRepository,
    private readonly db: Db,
  ) {}

  private async loadAdminConfig(): Promise<AdminConfigStats> {
    const [spaceMappingRows, userMappingRows, usersWithOverrides, tokenConfigured] =
      await withDbRetry(() =>
        Promise.all([
          this.spaceMappings.countByEnabled(),
          this.userMappings.countByEnabled(),
          this.userSpaceMappings.countDistinctUsers(),
          createSettingsService(this.db).isTokenConfigured(),
        ]),
      );

    const spaceMappings = mappingCountsFromRows(spaceMappingRows);
    const userMappingCounts = mappingCountsFromRows(userMappingRows);

    return {
      kind: "admin",
      spaceMappings,
      userMappings: {
        total: userMappingCounts.total,
        enabled: userMappingCounts.enabled,
      },
      usersWithOverrides,
      bitmapTokenConfigured: tokenConfigured,
    };
  }

  private async loadUserConfig(
    userId: string,
    userEmail: string,
  ): Promise<UserConfigStats> {
    const attribution = createSyncAttributionService(this.db);
    const [linkedMapping, overrideRows, enabledSpaces, userOverrideSpaces] =
      await withDbRetry(() =>
        Promise.all([
          attribution.isAppUserLinkedViaEmail(userEmail),
          this.userSpaceMappings.countByEnabledForUser(userId),
          this.spaceMappings.listEnabledSpaceKeys(),
          this.userSpaceMappings.listEnabledSpaceKeysForUser(userId),
        ]),
      );

    const overrides = mappingCountsFromRows(overrideRows);
    const covered = new Set(userOverrideSpaces);
    const availableSpaces = enabledSpaces.length;
    const spacesMissingOverride = enabledSpaces.filter(
      (key) => !covered.has(key),
    ).length;

    return {
      kind: "user",
      linkedMapping,
      overrides,
      availableSpaces,
      spacesMissingOverride,
    };
  }

  async getStats(options?: {
    now?: Date;
    range?: DashboardRange;
    scope?: DashboardScope;
  }): Promise<DashboardStats> {
    const now = options?.now ?? new Date();
    const range = options?.range ?? DEFAULT_DASHBOARD_RANGE;
    const scope: DashboardScope = options?.scope ?? { type: "all" };
    const since = rangeSince(range, now);
    const granularity = volumeGranularity(range);

    const [windowRows, openStatusRows, skipReasonRows] = await withDbRetry(() =>
      Promise.all([
        this.syncs.dashboardWindowCounts(scope, since),
        this.syncs.dashboardOpenCounts(scope),
        this.syncs.dashboardSkipReasons(scope, since),
      ]),
    );

    const [problemSpaceRows, volumeRows, recentIssueRows] = await withDbRetry(
      () =>
        Promise.all([
          this.syncs.dashboardProblemSpaces(scope, since),
          this.syncs.dashboardVolume(scope, since, granularity),
          this.syncs.dashboardRecentIssues(scope, since),
        ]),
    );

    const config =
      scope.type === "user"
        ? await this.loadUserConfig(scope.userId, scope.userEmail)
        : await this.loadAdminConfig();

    const openCounts = Object.fromEntries(
      openStatusRows.map((r) => [r.status, Number(r.count)]),
    ) as Partial<Record<string, number>>;

    return assembleDashboardStats({
      range,
      scopeType: scope.type,
      windowRows: windowRows.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
      openFailed: openCounts.failed ?? 0,
      openPending: openCounts.pending ?? 0,
      skipReasons: skipReasonRows.map((r) => ({
        reason: r.reason,
        count: Number(r.count),
      })),
      problemSpaces: problemSpaceRows.map((r) => ({
        jiraSpaceId: r.jiraSpaceId,
        count: Number(r.count),
      })),
      volumeRows: volumeRows.map((r) => ({
        bucket: r.bucket,
        count: Number(r.count),
      })),
      config,
      recentIssueRows,
      now,
    });
  }
}

export function createDashboardStatsService(db: Db = getDb()) {
  return new DashboardStatsService(
    new WorklogSyncsRepository(db),
    new SpaceProjectMappingsRepository(db),
    new UserMappingsRepository(db),
    new UserSpaceMappingsRepository(db),
    new SettingsRepository(db),
    db,
  );
}

export async function getDashboardStats(options?: {
  db?: Db;
  now?: Date;
  range?: DashboardRange;
  scope?: DashboardScope;
}): Promise<DashboardStats> {
  const db = options?.db ?? getDb();
  return createDashboardStatsService(db).getStats({
    now: options?.now,
    range: options?.range,
    scope: options?.scope,
  });
}
