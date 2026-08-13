import {
  isProjectListStatus,
  type ProjectListStatus,
} from "@/lib/project-list-status";
import {
  isExcludedClientId,
  isExcludedClientName,
  withoutExcludedClients,
} from "@/lib/excluded-clients";
import type { ProjectDashboardResult } from "@/services/project-dashboard";

export const PROJECTS_DASHBOARD_SELECTION_KEY =
  "projects-dashboard-selection";

export type CachedBitmapClient = {
  id: string;
  name: string;
  client_key?: string | null;
  has_projects?: boolean | null;
};

export type CachedBitmapProject = {
  id: string;
  name?: string | null;
  key?: string | null;
  state?: string | null;
};

type ProjectsDashboardSnapshot = {
  clients: CachedBitmapClient[];
  clientId: string;
  projectStatus: ProjectListStatus;
  projects: CachedBitmapProject[];
  projectId: string;
  dashboard: ProjectDashboardResult | null;
};

type StoredSelection = {
  clientId: string;
  projectId: string;
  projectStatus: ProjectListStatus;
};

function projectsKey(clientId: string, status: ProjectListStatus): string {
  return `${clientId}:${status}`;
}

/**
 * Module-scoped client cache for the projects dashboard.
 * Survives App Router unmount when navigating away and back.
 * Selection is also mirrored to localStorage so it survives full reloads.
 */
const memory = {
  clients: null as CachedBitmapClient[] | null,
  projectsByKey: new Map<string, CachedBitmapProject[]>(),
  dashboardByProjectId: new Map<string, ProjectDashboardResult>(),
  clientId: "",
  projectStatus: "active" as ProjectListStatus,
  projectId: "",
};

let hydratedFromStorage = false;

function readStoredSelection(): StoredSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROJECTS_DASHBOARD_SELECTION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const clientId =
      typeof record.clientId === "string" ? record.clientId : "";
    const projectId =
      typeof record.projectId === "string" ? record.projectId : "";
    const statusCandidate =
      typeof record.projectStatus === "string" ? record.projectStatus : null;
    const projectStatus = isProjectListStatus(statusCandidate)
      ? statusCandidate
      : "active";
    return { clientId, projectId, projectStatus };
  } catch {
    return null;
  }
}

function writeStoredSelection(): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredSelection = {
      clientId: memory.clientId,
      projectId: memory.projectId,
      projectStatus: memory.projectStatus,
    };
    localStorage.setItem(
      PROJECTS_DASHBOARD_SELECTION_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // ignore quota / private-mode failures
  }
}

/**
 * Apply persisted selection into module memory.
 * Call from a client useEffect after mount — never during render — so SSR
 * HTML stays aligned with the first client paint.
 */
export function hydrateProjectsDashboardSelectionFromStorage(): StoredSelection | null {
  if (hydratedFromStorage) return null;
  hydratedFromStorage = true;
  const stored = readStoredSelection();
  if (!stored) return null;
  if (isExcludedClientId(stored.clientId)) {
    memory.clientId = "";
    memory.projectId = "";
    memory.projectStatus = stored.projectStatus;
    writeStoredSelection();
    return { clientId: "", projectId: "", projectStatus: stored.projectStatus };
  }
  memory.clientId = stored.clientId;
  memory.projectId = stored.projectId;
  memory.projectStatus = stored.projectStatus;
  return stored;
}

export function readProjectsDashboardCache(): ProjectsDashboardSnapshot {
  const clientId = isExcludedClientId(memory.clientId) ? "" : memory.clientId;
  const projectId = clientId ? memory.projectId : "";
  const { projectStatus } = memory;
  const key = clientId ? projectsKey(clientId, projectStatus) : "";
  const projects =
    key && memory.projectsByKey.has(key)
      ? (memory.projectsByKey.get(key) ?? [])
      : [];
  const dashboardRaw =
    projectId && memory.dashboardByProjectId.has(projectId)
      ? (memory.dashboardByProjectId.get(projectId) ?? null)
      : null;
  const dashboard =
    dashboardRaw && isExcludedClientName(dashboardRaw.project.clientName)
      ? null
      : dashboardRaw;

  return {
    clients: withoutExcludedClients(memory.clients ?? []),
    clientId,
    projectStatus,
    projects,
    projectId,
    dashboard,
  };
}

/**
 * After a project list loads, keep the prior selection when still valid.
 * Used so a hydrated localStorage projectId survives until options arrive.
 */
export function resolveSelectedProjectId(
  previousId: string,
  projects: Array<{ id: string }>,
): string {
  if (projects.length === 1) return projects[0]?.id ?? "";
  if (previousId && projects.some((p) => p.id === previousId)) {
    return previousId;
  }
  return "";
}

export function setProjectsDashboardSelection(selection: {
  clientId?: string;
  projectId?: string;
  projectStatus?: ProjectListStatus;
}): void {
  if (selection.clientId !== undefined) {
    memory.clientId = isExcludedClientId(selection.clientId)
      ? ""
      : selection.clientId;
    if (!memory.clientId) {
      memory.projectId = "";
    }
  }
  if (selection.projectId !== undefined && memory.clientId) {
    memory.projectId = selection.projectId;
  }
  if (selection.projectStatus !== undefined) {
    memory.projectStatus = selection.projectStatus;
  }
  writeStoredSelection();
}

export function getCachedClients(): CachedBitmapClient[] | null {
  if (!memory.clients) return null;
  return withoutExcludedClients(memory.clients);
}

export function setCachedClients(clients: CachedBitmapClient[]): void {
  memory.clients = withoutExcludedClients(clients);
}

export function invalidateCachedClients(): void {
  memory.clients = null;
}

export function getCachedProjects(
  clientId: string,
  status: ProjectListStatus = "active",
): CachedBitmapProject[] | null {
  if (!clientId) return null;
  return memory.projectsByKey.get(projectsKey(clientId, status)) ?? null;
}

export function setCachedProjects(
  clientId: string,
  projects: CachedBitmapProject[],
  status: ProjectListStatus = "active",
): void {
  if (!clientId) return;
  memory.projectsByKey.set(projectsKey(clientId, status), projects);
}

export function invalidateCachedProjects(
  clientId?: string,
  status?: ProjectListStatus,
): void {
  if (!clientId) {
    memory.projectsByKey.clear();
    return;
  }
  if (status) {
    memory.projectsByKey.delete(projectsKey(clientId, status));
    return;
  }
  for (const key of memory.projectsByKey.keys()) {
    if (key.startsWith(`${clientId}:`)) {
      memory.projectsByKey.delete(key);
    }
  }
}

export function getCachedDashboard(
  projectId: string,
): ProjectDashboardResult | null {
  if (!projectId) return null;
  const dashboard = memory.dashboardByProjectId.get(projectId) ?? null;
  if (
    dashboard &&
    isExcludedClientName(dashboard.project.clientName)
  ) {
    return null;
  }
  return dashboard;
}

export function setCachedDashboard(
  projectId: string,
  dashboard: ProjectDashboardResult,
): void {
  if (!projectId) return;
  memory.dashboardByProjectId.set(projectId, dashboard);
}

export function invalidateCachedDashboard(projectId?: string): void {
  if (projectId) {
    memory.dashboardByProjectId.delete(projectId);
    return;
  }
  memory.dashboardByProjectId.clear();
}

/** Test helper: reset module memory and hydration flag. */
export function resetProjectsDashboardCacheForTests(): void {
  memory.clients = null;
  memory.projectsByKey.clear();
  memory.dashboardByProjectId.clear();
  memory.clientId = "";
  memory.projectStatus = "active";
  memory.projectId = "";
  hydratedFromStorage = false;
}
