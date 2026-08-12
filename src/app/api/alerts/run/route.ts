import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { createAlertService } from "@/services/alert-service";

function authorizeCronOrAdmin(request: NextRequest): Promise<Response | null> {
  const secret = getEnv().CRON_SECRET;
  const header = request.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) {
    return Promise.resolve(null);
  }
  return requireAdmin(request).then((auth) => auth.error ?? null);
}

export async function GET(request: NextRequest) {
  const denied = await authorizeCronOrAdmin(request);
  if (denied) return denied;

  const weekly =
    request.nextUrl.searchParams.get("weekly") === "1" ||
    request.nextUrl.searchParams.get("weekly") === "true";
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  try {
    const result = await createAlertService().evaluate({
      deliver: !dryRun,
      weeklyDigest: weekly,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Alert run failed" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
