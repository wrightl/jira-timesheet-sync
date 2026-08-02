import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import { requireAuth } from "@/lib/auth";
import { createBitmapApiClient } from "@/clients/internal-pm";
import { eq } from "drizzle-orm";
import { settings } from "@/db/schema";
import {
  projectDateRangeFromStarted,
  resolveProjectsForClient,
} from "@/services/bitmap-resolver";

async function resolvePmToken(): Promise<string> {
  const encryptionKey = process.env.SETTINGS_ENCRYPTION_KEY;
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(settings)
      .where(eq(settings.id, "default"))
      .limit(1);
    const encrypted = rows[0]?.internalPmAccessTokenEncrypted;
    if (encrypted && encryptionKey) {
      return decryptSecret(encrypted, encryptionKey);
    }
  } catch {
    // fall through
  }
  return process.env.INTERNAL_PM_ACCESS_TOKEN || "";
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) {
    return Response.json({ error: "clientId is required" }, { status: 400 });
  }

  const started =
    searchParams.get("started") ?? new Date().toISOString();

  try {
    const token = await resolvePmToken();
    const api = createBitmapApiClient({
      accessToken: token,
      baseUrl: process.env.INTERNAL_PM_BASE_URL,
    });
    const { rangeStart, rangeEnd } = projectDateRangeFromStarted(started);
    const db = getDb();
    const projects = await resolveProjectsForClient(
      db,
      api,
      clientId,
      rangeStart,
      rangeEnd,
    );
    return Response.json({ projects, rangeStart, rangeEnd });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load projects";
    return Response.json({ error: message }, { status: 502 });
  }
}
