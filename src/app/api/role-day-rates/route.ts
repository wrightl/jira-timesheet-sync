import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { roleDayRateCreateSchema } from "@/lib/validators";
import {
  DuplicateRoleDayRateError,
  RoleDayRatesRepository,
} from "@/repositories/role-day-rates-repository";
import { UserMappingsRepository } from "@/repositories/user-mappings-repository";

function knownJobTitles(
  titles: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const title of titles) {
    const trimmed = title?.trim().replace(/\s+/g, " ") ?? "";
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  unique.sort((a, b) => a.localeCompare(b));
  return unique;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const db = getDb();
  const [rates, mappings] = await Promise.all([
    new RoleDayRatesRepository(db).list(),
    new UserMappingsRepository(db).list(),
  ]);

  return Response.json({
    rates,
    knownJobTitles: knownJobTitles(mappings.map((mapping) => mapping.jobTitle)),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(request, roleDayRateCreateSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const rate = await new RoleDayRatesRepository(getDb()).create(parsed.data);
    return Response.json(rate, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateRoleDayRateError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to save day rate",
      },
      { status: 400 },
    );
  }
}
