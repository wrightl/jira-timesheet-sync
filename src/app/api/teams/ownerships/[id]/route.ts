import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/db";
import { TeamsRepository } from "@/repositories/teams-repository";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  if (!id) {
    return Response.json({ error: "Missing ownership id" }, { status: 400 });
  }

  const deleted = await new TeamsRepository(getDb()).deleteOwnership(id);
  if (!deleted) {
    return Response.json({ error: "Ownership not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
