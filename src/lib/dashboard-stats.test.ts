import { describe, expect, it } from "vitest";
import {
  assembleDashboardStats,
  buildVolumeBuckets,
  emptyStatusCounts,
  mappingCountsFromRows,
  parseDashboardRange,
  rangeSince,
  statusCountsFromRows,
  successRate,
  volumeBucketCount,
} from "@/lib/dashboard-stats";

describe("parseDashboardRange", () => {
  it("accepts known ranges and defaults otherwise", () => {
    expect(parseDashboardRange("24h")).toBe("24h");
    expect(parseDashboardRange("7d")).toBe("7d");
    expect(parseDashboardRange("30d")).toBe("30d");
    expect(parseDashboardRange("90d")).toBe("90d");
    expect(parseDashboardRange("nope")).toBe("7d");
    expect(parseDashboardRange(undefined)).toBe("7d");
  });
});

describe("rangeSince", () => {
  it("computes window starts relative to now", () => {
    const now = new Date("2026-08-03T12:00:00.000Z");
    expect(rangeSince("24h", now).toISOString()).toBe(
      "2026-08-02T12:00:00.000Z",
    );
    expect(rangeSince("7d", now).toISOString()).toBe(
      "2026-07-27T12:00:00.000Z",
    );
    expect(rangeSince("30d", now).toISOString()).toBe(
      "2026-07-04T12:00:00.000Z",
    );
    expect(rangeSince("90d", now).toISOString()).toBe(
      "2026-05-05T12:00:00.000Z",
    );
  });
});

describe("emptyStatusCounts", () => {
  it("returns zeros for all statuses", () => {
    expect(emptyStatusCounts()).toEqual({
      synced: 0,
      failed: 0,
      skipped: 0,
      pending: 0,
    });
  });
});

describe("statusCountsFromRows", () => {
  it("maps known statuses and ignores unknown", () => {
    expect(
      statusCountsFromRows([
        { status: "synced", count: 10 },
        { status: "failed", count: 2 },
        { status: "skipped", count: 3 },
        { status: "pending", count: 1 },
        { status: "other", count: 99 },
      ]),
    ).toEqual({
      synced: 10,
      failed: 2,
      skipped: 3,
      pending: 1,
    });
  });

  it("defaults missing statuses to zero", () => {
    expect(statusCountsFromRows([{ status: "synced", count: 5 }])).toEqual({
      synced: 5,
      failed: 0,
      skipped: 0,
      pending: 0,
    });
  });
});

describe("successRate", () => {
  it("returns null when there are no completed events", () => {
    expect(successRate(emptyStatusCounts())).toBeNull();
    expect(
      successRate({ synced: 0, failed: 0, skipped: 0, pending: 4 }),
    ).toBeNull();
  });

  it("excludes pending from the denominator", () => {
    expect(
      successRate({ synced: 8, failed: 1, skipped: 1, pending: 50 }),
    ).toBe(0.8);
  });
});

describe("buildVolumeBuckets", () => {
  it("fills seven UTC days ending on now, including zeros", () => {
    const now = new Date("2026-08-03T15:00:00.000Z");
    const volume = buildVolumeBuckets(
      [
        { bucket: "2026-08-01", count: 4 },
        { bucket: "2026-08-03", count: 9 },
      ],
      "7d",
      now,
    );

    expect(volume).toHaveLength(7);
    expect(volume.map((v) => ({ key: v.key, count: v.count }))).toEqual([
      { key: "2026-07-28", count: 0 },
      { key: "2026-07-29", count: 0 },
      { key: "2026-07-30", count: 0 },
      { key: "2026-07-31", count: 0 },
      { key: "2026-08-01", count: 4 },
      { key: "2026-08-02", count: 0 },
      { key: "2026-08-03", count: 9 },
    ]);
  });

  it("builds 24 hourly buckets for the 24h range", () => {
    const now = new Date("2026-08-03T15:30:00.000Z");
    const volume = buildVolumeBuckets(
      [{ bucket: "2026-08-03T14:00:00", count: 3 }],
      "24h",
      now,
    );

    expect(volume).toHaveLength(24);
    expect(volumeBucketCount("24h")).toBe(24);
    expect(volume.at(-1)?.key).toBe("2026-08-03T15");
    expect(volume.find((v) => v.key === "2026-08-03T14")?.count).toBe(3);
  });

  it("normalizes Date day values to UTC date keys", () => {
    const now = new Date("2026-08-03T12:00:00.000Z");
    const volume = buildVolumeBuckets(
      [{ bucket: new Date("2026-08-02T00:00:00.000Z"), count: 2 }],
      "7d",
      now,
    );
    expect(volume.find((d) => d.key === "2026-08-02")?.count).toBe(2);
  });
});

describe("mappingCountsFromRows", () => {
  it("sums enabled and disabled", () => {
    expect(
      mappingCountsFromRows([
        { enabled: true, count: 5 },
        { enabled: false, count: 2 },
      ]),
    ).toEqual({ total: 7, enabled: 5, disabled: 2 });
  });

  it("handles empty rows", () => {
    expect(mappingCountsFromRows([])).toEqual({
      total: 0,
      enabled: 0,
      disabled: 0,
    });
  });
});

const emptyAdminConfig = {
  kind: "admin" as const,
  spaceMappings: { total: 0, enabled: 0, disabled: 0 },
  userMappings: { total: 0, enabled: 0 },
  usersWithOverrides: 0,
  bitmapTokenConfigured: false,
};

describe("assembleDashboardStats", () => {
  it("returns empty defaults when all inputs are empty", () => {
    const now = new Date("2026-08-03T12:00:00.000Z");
    const stats = assembleDashboardStats({
      range: "7d",
      scopeType: "all",
      windowRows: [],
      openFailed: 0,
      openPending: 0,
      skipReasons: [],
      problemSpaces: [],
      volumeRows: [],
      config: emptyAdminConfig,
      recentIssueRows: [],
      now,
    });

    expect(stats.range).toBe("7d");
    expect(stats.rangeLabel).toBe("Last 7 days");
    expect(stats.scopeType).toBe("all");
    expect(stats.window).toEqual(emptyStatusCounts());
    expect(stats.successRate).toBeNull();
    expect(stats.openFailed).toBe(0);
    expect(stats.openPending).toBe(0);
    expect(stats.skipReasons).toEqual([]);
    expect(stats.problemSpaces).toEqual([]);
    expect(stats.volume).toHaveLength(7);
    expect(stats.volume.every((d) => d.count === 0)).toBe(true);
    expect(stats.volumeGranularity).toBe("day");
    expect(stats.config).toEqual(emptyAdminConfig);
    expect(stats.recentIssues).toEqual([]);
  });

  it("assembles user-scoped empty defaults with user config", () => {
    const now = new Date("2026-08-03T12:00:00.000Z");
    const userConfig = {
      kind: "user" as const,
      linkedMapping: false,
      overrides: { total: 0, enabled: 0, disabled: 0 },
      availableSpaces: 3,
      spacesMissingOverride: 3,
    };
    const stats = assembleDashboardStats({
      range: "24h",
      scopeType: "user",
      windowRows: [],
      openFailed: 0,
      openPending: 0,
      skipReasons: [],
      problemSpaces: [],
      volumeRows: [],
      config: userConfig,
      recentIssueRows: [],
      now,
    });

    expect(stats.scopeType).toBe("user");
    expect(stats.config).toEqual(userConfig);
    expect(stats.volume).toHaveLength(24);
    expect(stats.window).toEqual(emptyStatusCounts());
  });

  it("assembles populated metrics and recent issue retry flags", () => {
    const now = new Date("2026-08-03T12:00:00.000Z");
    const stats = assembleDashboardStats({
      range: "30d",
      scopeType: "all",
      windowRows: [
        { status: "synced", count: 40 },
        { status: "failed", count: 5 },
        { status: "skipped", count: 5 },
      ],
      openFailed: 2,
      openPending: 1,
      skipReasons: [
        { reason: "no_mapping", count: 4 },
        { reason: null, count: 1 },
      ],
      problemSpaces: [{ jiraSpaceId: "10001", count: 6 }],
      volumeRows: [{ bucket: "2026-08-03", count: 7 }],
      config: {
        kind: "admin",
        spaceMappings: { total: 9, enabled: 8, disabled: 1 },
        userMappings: { total: 15, enabled: 15 },
        usersWithOverrides: 3,
        bitmapTokenConfigured: true,
      },
      recentIssueRows: [
        {
          id: "a",
          jiraWorklogId: "wl-1",
          jiraIssueKey: "ABC-1",
          jiraSpaceId: "10001",
          eventType: "worklog_created",
          status: "failed",
          error: "Bitmap 500",
          rawPayload: "{}",
          createdAt: new Date("2026-08-03T10:00:00.000Z"),
        },
        {
          id: "b",
          jiraWorklogId: "wl-2",
          jiraIssueKey: null,
          jiraSpaceId: null,
          eventType: "worklog_updated",
          status: "skipped",
          error: "no_mapping",
          rawPayload: null,
          createdAt: "2026-08-02T10:00:00.000Z",
        },
      ],
      now,
    });

    expect(stats.range).toBe("30d");
    expect(stats.window.synced).toBe(40);
    expect(stats.successRate).toBe(0.8);
    expect(stats.openFailed).toBe(2);
    expect(stats.openPending).toBe(1);
    expect(stats.skipReasons).toEqual([
      { reason: "no_mapping", count: 4 },
      { reason: "unknown", count: 1 },
    ]);
    expect(stats.problemSpaces).toEqual([
      { jiraSpaceId: "10001", count: 6 },
    ]);
    expect(stats.config).toMatchObject({
      kind: "admin",
      spaceMappings: { total: 9, enabled: 8, disabled: 1 },
      userMappings: { total: 15, enabled: 15 },
      usersWithOverrides: 3,
      bitmapTokenConfigured: true,
    });
    expect(stats.recentIssues).toHaveLength(2);
    expect(stats.recentIssues[0]).toMatchObject({
      id: "a",
      canRetry: true,
      createdAt: "2026-08-03T10:00:00.000Z",
    });
    expect(stats.recentIssues[1]).toMatchObject({
      id: "b",
      canRetry: false,
      createdAt: "2026-08-02T10:00:00.000Z",
    });
    expect(stats.volume).toHaveLength(30);
    expect(stats.volume.at(-1)).toMatchObject({
      key: "2026-08-03",
      count: 7,
    });
  });
});
