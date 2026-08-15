import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import type { PortfolioRiskTier } from "@/lib/portfolio";
import { createPortfolioService } from "@/services/portfolio-service";
import { TeamsRepository } from "@/repositories/teams-repository";
import { getDb } from "@/db";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const url = request.nextUrl;
  const clientId = url.searchParams.get("clientId");
  const owner = url.searchParams.get("owner");
  const teamId = url.searchParams.get("teamId");
  const mine = url.searchParams.get("mine") === "1";
  const riskTier = url.searchParams.get("riskTier") as PortfolioRiskTier | null;

  try {
    const result = await createPortfolioService().getPortfolio({
      clientId,
      owner,
      teamId,
      mineForUserId: mine ? auth.user.id : null,
      riskTier:
        riskTier === "ok" ||
        riskTier === "watch" ||
        riskTier === "risk" ||
        riskTier === "unavailable"
          ? riskTier
          : null,
    });

    let teams: Array<{ id: string; name: string }> = [];
    try {
      teams = (await new TeamsRepository(getDb()).listTeams()).map((t) => ({
        id: t.id,
        name: t.name,
      }));
    } catch {
      teams = [];
    }

    return Response.json({ ...result, teams });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load portfolio" },
      { status: 502 },
    );
  }
}
