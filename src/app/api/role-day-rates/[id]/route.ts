import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { roleDayRateUpdateSchema } from "@/lib/validators";
import {
  DuplicateRoleDayRateError,
  RoleDayRatesRepository,
} from "@/repositories/role-day-rates-repository";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const parsed = await parseJsonBody(request, roleDayRateUpdateSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const rate = await new RoleDayRatesRepository(getDb()).update(
      id,
      parsed.data,
    );
    if (!rate) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(rate);
  } catch (err) {
    if (err instanceof DuplicateRoleDayRateError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to update day rate",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const ok = await new RoleDayRatesRepository(getDb()).delete(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
