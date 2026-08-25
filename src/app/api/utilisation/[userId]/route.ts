import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  UtilisationPersonNotFoundError,
  createUtilisationService,
} from "@/services/utilisation-service";

type Params = { params: Promise<{ userId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { userId } = await params;
  if (!userId?.trim()) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  const rangeDays = Number(request.nextUrl.searchParams.get("rangeDays") ?? 7);

  try {
    const result = await createUtilisationService().getPersonDetail({
      userId: userId.trim(),
      rangeDays: Number.isFinite(rangeDays) ? rangeDays : 7,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof UtilisationPersonNotFoundError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to load utilisation detail",
      },
      { status: 502 },
    );
  }
}
