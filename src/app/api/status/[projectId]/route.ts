import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ExcludedClientError } from "@/lib/excluded-clients";
import { createStatusNarrativeService } from "@/services/status-narrative-service";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { projectId } = await params;
  if (!projectId?.trim()) {
    return Response.json({ error: "projectId is required" }, { status: 400 });
  }

  try {
    const narrative = await createStatusNarrativeService().buildForProject(
      projectId,
    );
    return Response.json(narrative);
  } catch (err) {
    if (err instanceof ExcludedClientError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to build status narrative",
      },
      { status: 502 },
    );
  }
}
