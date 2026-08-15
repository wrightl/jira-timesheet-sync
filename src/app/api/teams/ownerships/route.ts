import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { teamOwnershipCreateSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { TeamsRepository } from "@/repositories/teams-repository";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(request, teamOwnershipCreateSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const repo = new TeamsRepository(getDb());
    const team = await repo.getTeam(parsed.data.teamId);
    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }
    const ownership = await repo.createOwnership({
      teamId: parsed.data.teamId,
      clientId: parsed.data.clientId,
      clientName: parsed.data.clientName ?? null,
      projectId: parsed.data.projectId ?? "",
      projectName: parsed.data.projectName ?? null,
    });
    return Response.json(ownership, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create ownership",
      },
      { status: 400 },
    );
  }
}
