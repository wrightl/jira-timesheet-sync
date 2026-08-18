import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createUtilisationService } from "@/services/utilisation-service";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const rangeDays = Number(request.nextUrl.searchParams.get("rangeDays") ?? 7);
  const teamId = request.nextUrl.searchParams.get("teamId");
  const userId = request.nextUrl.searchParams.get("userId");

  try {
    const result = await createUtilisationService().getUtilisation({
      rangeDays: Number.isFinite(rangeDays) ? rangeDays : 7,
      teamId,
      userId,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load utilisation",
      },
      { status: 502 },
    );
  }
}
