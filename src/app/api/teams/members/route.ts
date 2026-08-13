import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { teamMemberCreateSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { TeamsRepository } from "@/repositories/teams-repository";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(request, teamMemberCreateSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const member = await new TeamsRepository(getDb()).createMember(parsed.data);
    return Response.json(member, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to add member" },
      { status: 400 },
    );
  }
}
