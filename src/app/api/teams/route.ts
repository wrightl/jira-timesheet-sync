import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { teamCreateSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { TeamsRepository } from "@/repositories/teams-repository";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const repo = new TeamsRepository(getDb());
  const [teams, members] = await Promise.all([
    repo.listTeams(),
    repo.listMembers(),
  ]);
  return Response.json({
    teams: teams.map((team) => ({
      ...team,
      memberCount: members.filter((m) => m.teamId === team.id).length,
    })),
    members,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(request, teamCreateSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const team = await new TeamsRepository(getDb()).createTeam(parsed.data);
    return Response.json(team, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to create team" },
      { status: 400 },
    );
  }
}
