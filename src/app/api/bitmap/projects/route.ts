import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  isProjectListStatus,
  type ProjectListStatus,
} from "@/lib/project-list-status";
import {
  createBitmapResolverService,
  projectDateRangeFromStarted,
} from "@/services/bitmap-resolver";
import { createSettingsService } from "@/services/settings-service";

function parseProjectListStatus(
  status: string | null,
  scope: string | null,
): ProjectListStatus | null {
  if (isProjectListStatus(status)) return status;
  // Legacy dashboard picker used scope=active
  if (scope === "active") return "active";
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) {
    return Response.json({ error: "clientId is required" }, { status: 400 });
  }

  const status = parseProjectListStatus(
    searchParams.get("status"),
    searchParams.get("scope"),
  );
  const refresh = searchParams.get("refresh") === "1";
  const started = searchParams.get("started") ?? new Date().toISOString();

  try {
    const settings = createSettingsService();
    const api = await settings.createConfiguredBitmapClient();
    const resolver = createBitmapResolverService();

    if (status) {
      const projects = await resolver.listProjectsForClientByStatus(
        api,
        clientId,
        status,
        { forceRefresh: refresh },
      );
      return Response.json({ projects, status });
    }

    const { rangeStart, rangeEnd } = projectDateRangeFromStarted(started);
    const projects = await resolver.resolveProjectsForClient(
      api,
      clientId,
      rangeStart,
      rangeEnd,
    );
    return Response.json({ projects, rangeStart, rangeEnd });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load projects";
    return Response.json({ error: message }, { status: 502 });
  }
}
