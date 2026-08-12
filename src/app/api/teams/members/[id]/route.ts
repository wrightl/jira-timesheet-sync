import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/db";
import { TeamsRepository } from "@/repositories/teams-repository";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const ok = await new TeamsRepository(getDb()).deleteMember(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
