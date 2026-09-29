import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import {
  ROLE_DAY_RATE_TITLES,
  currentEffectiveMonth,
  scheduleTiming,
} from "@/lib/role-day-rates";
import { roleDayRateScheduleSchema } from "@/lib/validators";
import {
  DuplicateRoleDayRateScheduleError,
  RoleDayRatesRepository,
} from "@/repositories/role-day-rates-repository";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const parsed = await parseJsonBody(request, roleDayRateScheduleSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const schedule = await new RoleDayRatesRepository(getDb()).update(
      id,
      parsed.data,
    );
    if (!schedule) return Response.json({ error: "Not found" }, { status: 404 });
    const todayMonth = currentEffectiveMonth();
    return Response.json({
      id: schedule.id,
      effectiveMonth: schedule.effectiveMonth,
      timing: scheduleTiming(schedule.effectiveMonth, [schedule], todayMonth),
      rates: ROLE_DAY_RATE_TITLES.map((roleName) => ({
        roleName,
        dayRateCost:
          schedule.rates.find((rate) => rate.roleName === roleName)
            ?.dayRateCost ?? null,
      })),
    });
  } catch (err) {
    if (err instanceof DuplicateRoleDayRateScheduleError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update rate set",
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
