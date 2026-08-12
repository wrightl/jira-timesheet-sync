import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { teamCreateSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { TeamsRepository } from "@/repositories/teams-repository";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const parsed = await parseJsonBody(request, teamCreateSchema);
  if ("error" in parsed) return parsed.error;

  const team = await new TeamsRepository(getDb()).updateTeam(
    id,
    parsed.data.name,
  );
  if (!team) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(team);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const ok = await new TeamsRepository(getDb()).deleteTeam(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
