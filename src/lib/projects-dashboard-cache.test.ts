import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROJECTS_DASHBOARD_SELECTION_KEY,
  hydrateProjectsDashboardSelectionFromStorage,
  readProjectsDashboardCache,
  resetProjectsDashboardCacheForTests,
  resolveSelectedProjectId,
  setCachedClients,
  setProjectsDashboardSelection,
} from "@/lib/projects-dashboard-cache";
import { EXCLUDED_CLIENT_ID_THECURVE } from "@/lib/excluded-clients";

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

describe("projects-dashboard-cache selection persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", createMemoryStorage());
    resetProjectsDashboardCacheForTests();
  });

  afterEach(() => {
    resetProjectsDashboardCacheForTests();
    vi.unstubAllGlobals();
  });

  it("writes client, project, and status to localStorage", () => {
    setProjectsDashboardSelection({
      clientId: "client-1",
      projectId: "project-9",
      projectStatus: "completed",
    });

    expect(
      JSON.parse(
        localStorage.getItem(PROJECTS_DASHBOARD_SELECTION_KEY) ?? "{}",
      ),
    ).toEqual({
      clientId: "client-1",
      projectId: "project-9",
      projectStatus: "completed",
    });
  });

  it("does not read localStorage during cache snapshot (SSR-safe)", () => {
    localStorage.setItem(
      PROJECTS_DASHBOARD_SELECTION_KEY,
      JSON.stringify({
        clientId: "client-2",
        projectId: "project-3",
        projectStatus: "upcoming",
      }),
    );

    const snapshot = readProjectsDashboardCache();
    expect(snapshot.clientId).toBe("");
    expect(snapshot.projectId).toBe("");
    expect(snapshot.projectStatus).toBe("active");
  });

  it("restores selection from localStorage after hydrate (reload)", () => {
    setProjectsDashboardSelection({
      clientId: "client-2",
      projectId: "project-3",
      projectStatus: "upcoming",
    });

    resetProjectsDashboardCacheForTests();

    const stored = hydrateProjectsDashboardSelectionFromStorage();
    expect(stored).toEqual({
      clientId: "client-2",
      projectId: "project-3",
      projectStatus: "upcoming",
    });

    const snapshot = readProjectsDashboardCache();
    expect(snapshot.clientId).toBe("client-2");
    expect(snapshot.projectId).toBe("project-3");
    expect(snapshot.projectStatus).toBe("upcoming");
  });

  it("falls back to active status for invalid stored status", () => {
    localStorage.setItem(
      PROJECTS_DASHBOARD_SELECTION_KEY,
      JSON.stringify({
        clientId: "client-1",
        projectId: "project-1",
        projectStatus: "nope",
      }),
    );

    hydrateProjectsDashboardSelectionFromStorage();
    const snapshot = readProjectsDashboardCache();
    expect(snapshot.clientId).toBe("client-1");
    expect(snapshot.projectId).toBe("project-1");
    expect(snapshot.projectStatus).toBe("active");
  });

  it("ignores corrupt localStorage JSON", () => {
    localStorage.setItem(PROJECTS_DASHBOARD_SELECTION_KEY, "{not-json");

    hydrateProjectsDashboardSelectionFromStorage();
    const snapshot = readProjectsDashboardCache();
    expect(snapshot.clientId).toBe("");
    expect(snapshot.projectId).toBe("");
    expect(snapshot.projectStatus).toBe("active");
  });

  it("drops a persisted TheCurve client selection", () => {
    localStorage.setItem(
      PROJECTS_DASHBOARD_SELECTION_KEY,
      JSON.stringify({
        clientId: EXCLUDED_CLIENT_ID_THECURVE,
        projectId: "internal-project",
        projectStatus: "active",
      }),
    );

    const stored = hydrateProjectsDashboardSelectionFromStorage();
    expect(stored?.clientId).toBe("");
    expect(stored?.projectId).toBe("");
    expect(readProjectsDashboardCache().clientId).toBe("");
  });

  it("strips TheCurve from cached client dropdowns", () => {
    setCachedClients([
      { id: EXCLUDED_CLIENT_ID_THECURVE, name: "TheCurve" },
      { id: "c2", name: "Acme" },
    ]);
    expect(readProjectsDashboardCache().clients).toEqual([
      { id: "c2", name: "Acme" },
    ]);
  });
});

describe("resolveSelectedProjectId", () => {
  const projects = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];

  it("keeps a previously selected project once the list is available", () => {
    expect(resolveSelectedProjectId("p2", projects)).toBe("p2");
  });

  it("clears selection when the previous id is missing from the list", () => {
    expect(resolveSelectedProjectId("gone", projects)).toBe("");
  });

  it("clears selection when previous id was wiped before load", () => {
    expect(resolveSelectedProjectId("", projects)).toBe("");
  });

  it("auto-selects when there is exactly one project", () => {
    expect(resolveSelectedProjectId("", [{ id: "only" }])).toBe("only");
    expect(resolveSelectedProjectId("other", [{ id: "only" }])).toBe("only");
  });
});
