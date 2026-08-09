import type { ProjectListStatus } from "@/lib/project-list-status";
import type { ProjectDashboardResult } from "@/services/project-dashboard";

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

function projectsKey(clientId: string, status: ProjectListStatus): string {
  return `${clientId}:${status}`;
}

/**
 * Module-scoped client cache for the projects dashboard.
 * Survives App Router unmount when navigating away and back.
 */
const memory = {
  clients: null as CachedBitmapClient[] | null,
  projectsByKey: new Map<string, CachedBitmapProject[]>(),
  dashboardByProjectId: new Map<string, ProjectDashboardResult>(),
  clientId: "",
  projectStatus: "active" as ProjectListStatus,
  projectId: "",
};

export function readProjectsDashboardCache(): ProjectsDashboardSnapshot {
  const { clientId, projectId, projectStatus } = memory;
  const key = clientId ? projectsKey(clientId, projectStatus) : "";
  const projects =
    key && memory.projectsByKey.has(key)
      ? (memory.projectsByKey.get(key) ?? [])
      : [];
  const dashboard =
    projectId && memory.dashboardByProjectId.has(projectId)
      ? (memory.dashboardByProjectId.get(projectId) ?? null)
      : null;

  return {
    clients: memory.clients ?? [],
    clientId,
    projectStatus,
    projects,
    projectId,
    dashboard,
  };
}

export function setProjectsDashboardSelection(selection: {
  clientId?: string;
  projectId?: string;
  projectStatus?: ProjectListStatus;
}): void {
  if (selection.clientId !== undefined) {
    memory.clientId = selection.clientId;
  }
  if (selection.projectId !== undefined) {
    memory.projectId = selection.projectId;
  }
  if (selection.projectStatus !== undefined) {
    memory.projectStatus = selection.projectStatus;
  }
}

export function getCachedClients(): CachedBitmapClient[] | null {
  return memory.clients;
}

export function setCachedClients(clients: CachedBitmapClient[]): void {
  memory.clients = clients;
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
  return memory.dashboardByProjectId.get(projectId) ?? null;
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
