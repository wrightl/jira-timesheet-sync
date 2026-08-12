import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { createAlertService } from "@/services/alert-service";

async function authorize(request: NextRequest): Promise<Response | null> {
  const secret = getEnv().CRON_SECRET;
  const header = request.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) {
    return null;
  }
  const auth = await requireAdmin(request);
  return auth.error ?? null;
}

export async function GET(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  try {
    const result = await createAlertService().evaluate({
      deliver: !dryRun,
      weeklyDigest: true,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Weekly alert run failed" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
