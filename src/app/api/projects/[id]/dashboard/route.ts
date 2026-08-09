import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createProjectDashboardService } from "@/services/project-dashboard";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  if (!id?.trim()) {
    return Response.json({ error: "project id is required" }, { status: 400 });
  }

  try {
    const dashboard = await createProjectDashboardService().getDashboard(
      id.trim(),
    );
    return Response.json(dashboard);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load project dashboard";
    return Response.json({ error: message }, { status: 502 });
  }
}
