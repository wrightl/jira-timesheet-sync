import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import {
  ROLE_DAY_RATE_TITLES,
  activeSchedule,
  currentEffectiveMonth,
  scheduleTiming,
} from "@/lib/role-day-rates";
import { roleDayRateScheduleSchema } from "@/lib/validators";
import {
  DuplicateRoleDayRateScheduleError,
  RoleDayRatesRepository,
  type RoleDayRateScheduleRecord,
} from "@/repositories/role-day-rates-repository";

function presentSchedule(
  schedule: RoleDayRateScheduleRecord,
  schedules: RoleDayRateScheduleRecord[],
  todayMonth: string,
) {
  return {
    id: schedule.id,
    effectiveMonth: schedule.effectiveMonth,
    timing: scheduleTiming(schedule.effectiveMonth, schedules, todayMonth),
    rates: ROLE_DAY_RATE_TITLES.map((roleName) => ({
      roleName,
      dayRateCost:
        schedule.rates.find((rate) => rate.roleName === roleName)?.dayRateCost ??
        null,
    })),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const schedules = await new RoleDayRatesRepository(getDb()).list();
  const todayMonth = currentEffectiveMonth();
  const active = activeSchedule(schedules, todayMonth);

  return Response.json({
    titles: ROLE_DAY_RATE_TITLES,
    todayMonth,
    activeEffectiveMonth: active?.effectiveMonth ?? null,
    schedules: schedules.map((schedule) =>
      presentSchedule(schedule, schedules, todayMonth),
    ),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(request, roleDayRateScheduleSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const schedule = await new RoleDayRatesRepository(getDb()).create(
      parsed.data,
    );
    const todayMonth = currentEffectiveMonth();
    return Response.json(presentSchedule(schedule, [schedule], todayMonth), {
      status: 201,
    });
  } catch (err) {
    if (err instanceof DuplicateRoleDayRateScheduleError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to save rate set",
      },
      { status: 400 },
    );
  }
}
