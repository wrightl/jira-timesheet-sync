import { NextRequest } from "next/server";
import { requireLeadership } from "@/lib/auth";
import { ProfitabilityQueryError } from "@/lib/profitability";
import { createProfitabilityService } from "@/services/profitability-service";

export async function GET(request: NextRequest) {
  const auth = await requireLeadership(request);
  if (auth.error) return auth.error;

  const startDate = request.nextUrl.searchParams.get("startDate") ?? "";
  const endDate = request.nextUrl.searchParams.get("endDate") ?? "";
  const projectId = request.nextUrl.searchParams.get("projectId");

  try {
    const result = await createProfitabilityService().getProfitability({
      startDate,
      endDate,
      projectId,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof ProfitabilityQueryError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load profitability",
      },
      { status: 502 },
    );
  }
}
