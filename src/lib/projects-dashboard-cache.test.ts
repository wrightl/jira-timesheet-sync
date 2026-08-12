import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROJECTS_DASHBOARD_SELECTION_KEY,
  readProjectsDashboardCache,
  resetProjectsDashboardCacheForTests,
  setProjectsDashboardSelection,
} from "@/lib/projects-dashboard-cache";

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

  it("restores selection from localStorage after a cache reset (reload)", () => {
    setProjectsDashboardSelection({
      clientId: "client-2",
      projectId: "project-3",
      projectStatus: "upcoming",
    });

    resetProjectsDashboardCacheForTests();

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

    const snapshot = readProjectsDashboardCache();
    expect(snapshot.clientId).toBe("client-1");
    expect(snapshot.projectId).toBe("project-1");
    expect(snapshot.projectStatus).toBe("active");
  });

  it("ignores corrupt localStorage JSON", () => {
    localStorage.setItem(PROJECTS_DASHBOARD_SELECTION_KEY, "{not-json");

    const snapshot = readProjectsDashboardCache();
    expect(snapshot.clientId).toBe("");
    expect(snapshot.projectId).toBe("");
    expect(snapshot.projectStatus).toBe("active");
  });
});
