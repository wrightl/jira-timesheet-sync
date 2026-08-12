import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createUtilizationService } from "@/services/utilization-service";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const rangeDays = Number(request.nextUrl.searchParams.get("rangeDays") ?? 7);
  const teamId = request.nextUrl.searchParams.get("teamId");

  try {
    const result = await createUtilizationService().getUtilization({
      rangeDays: Number.isFinite(rangeDays) ? rangeDays : 7,
      teamId,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load utilization",
      },
      { status: 502 },
    );
  }
}
