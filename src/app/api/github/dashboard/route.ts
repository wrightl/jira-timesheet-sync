import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createGithubDashboardService } from "@/services/github-dashboard";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const dashboard = await createGithubDashboardService().getDashboard(
    auth.user.id,
  );
  return Response.json(dashboard);
}
