import { describe, expect, it } from "vitest";
import {
  ALL_METRIC_HELP_IDS,
  GITHUB_METRIC_IDS,
  METRIC_HELP,
  PORTFOLIO_METRIC_IDS,
  PROJECT_METRIC_IDS,
  SUPPORT_METRIC_IDS,
  SYNC_METRIC_IDS,
  getMetricHelp,
} from "@/lib/metric-help";

describe("metric help catalog", () => {
  it("has an entry with a formula for every known metric id", () => {
    expect(ALL_METRIC_HELP_IDS.length).toBeGreaterThan(0);
    for (const id of ALL_METRIC_HELP_IDS) {
      const entry = getMetricHelp(id);
      expect(entry, `missing help for ${id}`).toBeDefined();
      expect(entry?.formula.trim().length, `empty formula for ${id}`).toBeGreaterThan(
        0,
      );
      expect(entry?.title.trim().length, `empty title for ${id}`).toBeGreaterThan(
        0,
      );
      expect(
        entry?.sources.length,
        `no sources for ${id}`,
      ).toBeGreaterThan(0);
    }
  });

  it("covers each dashboard metric group", () => {
    expect(SYNC_METRIC_IDS).toHaveLength(5);
    expect(PORTFOLIO_METRIC_IDS).toHaveLength(5);
    expect(PROJECT_METRIC_IDS).toHaveLength(24);
    expect(GITHUB_METRIC_IDS).toHaveLength(8);
    expect(SUPPORT_METRIC_IDS).toHaveLength(3);
    expect(Object.keys(METRIC_HELP)).toHaveLength(ALL_METRIC_HELP_IDS.length);
  });
});
