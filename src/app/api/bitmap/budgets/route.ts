import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { createBitmapApiClient } from "@/clients/internal-pm";
import { requireAuth } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { resolveBudgetsForProject } from "@/services/bitmap-resolver";

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
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ error: "projectId is required" }, { status: 400 });
  }

  try {
    const token = await resolvePmToken();
    const api = createBitmapApiClient({
      accessToken: token,
      baseUrl: process.env.INTERNAL_PM_BASE_URL,
    });
    const db = getDb();
    const budgets = await resolveBudgetsForProject(db, api, projectId);
    return Response.json({ budgets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load budgets";
    return Response.json({ error: message }, { status: 502 });
  }
}
