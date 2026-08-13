import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioResult } from "@/lib/portfolio";
import { EXCLUDED_CLIENT_ID_THECURVE } from "@/lib/excluded-clients";
import {
  PORTFOLIO_DASHBOARD_SELECTION_KEY,
  getCachedPortfolio,
  hydratePortfolioDashboardSelectionFromStorage,
  invalidateCachedPortfolio,
  readPortfolioDashboardCache,
  resetPortfolioDashboardCacheForTests,
  setCachedPortfolio,
  setPortfolioDashboardSelection,
} from "@/lib/portfolio-dashboard-cache";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function samplePortfolio(): PortfolioResult {
  return {
    generatedAt: "2026-08-13T12:00:00.000Z",
    summary: {
      projectCount: 0,
      riskCount: 0,
      watchCount: 0,
      okCount: 0,
      avgBudgetBurnPct: null,
    },
    projects: [],
    syncFailedOpen: 0,
    error: null,
  };
}

describe("portfolio-dashboard-cache selection persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", createMemoryStorage());
    resetPortfolioDashboardCacheForTests();
  });

  afterEach(() => {
    resetPortfolioDashboardCacheForTests();
    vi.unstubAllGlobals();
  });

  it("writes client, risk, and owner filters to localStorage", () => {
    setPortfolioDashboardSelection({
      clientFilter: "client-1",
      riskFilter: "watch",
      ownerFilter: "Lee",
    });

    expect(
      JSON.parse(
        localStorage.getItem(PORTFOLIO_DASHBOARD_SELECTION_KEY) ?? "{}",
      ),
    ).toEqual({
      clientFilter: "client-1",
      riskFilter: "watch",
      ownerFilter: "Lee",
    });
  });

  it("does not read localStorage during cache snapshot (SSR-safe)", () => {
    localStorage.setItem(
      PORTFOLIO_DASHBOARD_SELECTION_KEY,
      JSON.stringify({
        clientFilter: "client-2",
        riskFilter: "risk",
        ownerFilter: "Sam",
      }),
    );

    const snapshot = readPortfolioDashboardCache();
    expect(snapshot.clientFilter).toBe("all");
    expect(snapshot.riskFilter).toBe("all");
    expect(snapshot.ownerFilter).toBe("");
  });

  it("restores selection from localStorage after hydrate (reload)", () => {
    setPortfolioDashboardSelection({
      clientFilter: "client-2",
      riskFilter: "risk",
      ownerFilter: "Sam",
    });

    resetPortfolioDashboardCacheForTests();

    const stored = hydratePortfolioDashboardSelectionFromStorage();
    expect(stored).toEqual({
      clientFilter: "client-2",
      riskFilter: "risk",
      ownerFilter: "Sam",
    });

    const snapshot = readPortfolioDashboardCache();
    expect(snapshot.clientFilter).toBe("client-2");
    expect(snapshot.riskFilter).toBe("risk");
    expect(snapshot.ownerFilter).toBe("Sam");
  });

  it("falls back to all for invalid stored risk filter", () => {
    localStorage.setItem(
      PORTFOLIO_DASHBOARD_SELECTION_KEY,
      JSON.stringify({
        clientFilter: "client-1",
        riskFilter: "nope",
        ownerFilter: "",
      }),
    );

    hydratePortfolioDashboardSelectionFromStorage();
    const snapshot = readPortfolioDashboardCache();
    expect(snapshot.clientFilter).toBe("client-1");
    expect(snapshot.riskFilter).toBe("all");
  });

  it("ignores corrupt localStorage JSON", () => {
    localStorage.setItem(PORTFOLIO_DASHBOARD_SELECTION_KEY, "{not-json");

    hydratePortfolioDashboardSelectionFromStorage();
    const snapshot = readPortfolioDashboardCache();
    expect(snapshot.clientFilter).toBe("all");
    expect(snapshot.riskFilter).toBe("all");
    expect(snapshot.ownerFilter).toBe("");
  });

  it("drops a persisted TheCurve client filter", () => {
    localStorage.setItem(
      PORTFOLIO_DASHBOARD_SELECTION_KEY,
      JSON.stringify({
        clientFilter: EXCLUDED_CLIENT_ID_THECURVE,
        riskFilter: "ok",
        ownerFilter: "",
      }),
    );

    const stored = hydratePortfolioDashboardSelectionFromStorage();
    expect(stored?.clientFilter).toBe("all");
    expect(readPortfolioDashboardCache().clientFilter).toBe("all");
  });
});

describe("portfolio-dashboard-cache data", () => {
  beforeEach(() => {
    resetPortfolioDashboardCacheForTests();
  });

  afterEach(() => {
    resetPortfolioDashboardCacheForTests();
  });

  it("stores and returns portfolio data across reads", () => {
    const data = samplePortfolio();
    setCachedPortfolio(data);
    expect(getCachedPortfolio()).toEqual(data);
    expect(readPortfolioDashboardCache().data).toEqual(data);
  });

  it("clears cached portfolio on invalidate", () => {
    setCachedPortfolio(samplePortfolio());
    invalidateCachedPortfolio();
    expect(getCachedPortfolio()).toBeNull();
  });

  it("strips TheCurve projects from cached portfolio data", () => {
    setCachedPortfolio({
      ...samplePortfolio(),
      projects: [
        {
          projectId: "internal",
          projectName: "Internal",
          projectKey: "INT",
          clientId: EXCLUDED_CLIENT_ID_THECURVE,
          clientName: "TheCurve",
          ownerName: null,
          state: "active",
          budgetBurnPct: 10,
          billableRemainingHours: 20,
          runwayDays: 12,
          scheduleSlipDays: 0,
          unhealthyChecks: 0,
          healthy: true,
          riskTier: "ok",
          riskReasons: [],
        },
      ],
      summary: {
        projectCount: 1,
        riskCount: 0,
        watchCount: 0,
        okCount: 1,
        avgBudgetBurnPct: 10,
      },
    });
    const cached = getCachedPortfolio();
    expect(cached?.projects).toEqual([]);
    expect(cached?.summary.projectCount).toBe(0);
  });
});
