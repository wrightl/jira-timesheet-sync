import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import type { PortfolioRiskTier } from "@/lib/portfolio";
import { createPortfolioService } from "@/services/portfolio-service";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const url = request.nextUrl;
  const clientId = url.searchParams.get("clientId");
  const owner = url.searchParams.get("owner");
  const riskTier = url.searchParams.get("riskTier") as PortfolioRiskTier | null;

  try {
    const result = await createPortfolioService().getPortfolio({
      clientId,
      owner,
      riskTier:
        riskTier === "ok" ||
        riskTier === "watch" ||
        riskTier === "risk" ||
        riskTier === "unavailable"
          ? riskTier
          : null,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load portfolio" },
      { status: 502 },
    );
  }
}
