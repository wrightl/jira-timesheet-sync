import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { parseDashboardRange } from "@/lib/dashboard-shared";
import { getDashboardStats } from "@/services/dashboard-stats-service";
import { createSettingsService } from "@/services/settings-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const range = parseDashboardRange(request.nextUrl.searchParams.get("range"));

  try {
    const [stats, settings] = await Promise.all([
      getDashboardStats({
        range,
        scope: {
          type: "user",
          userId: auth.user.id,
          userEmail: auth.user.email,
        },
      }),
      createSettingsService().getStatus(),
    ]);

    return Response.json({
      stats,
      jiraBrowseBaseUrl: settings.jiraBaseUrl,
    });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load dashboard",
      },
      { status: 502 },
    );
  }
}
