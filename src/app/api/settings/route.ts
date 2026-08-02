import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { encryptSecret, maskToken, decryptSecret } from "@/lib/crypto";
import { settingsUpdateSchema } from "@/lib/validators";

async function getStoredToken(): Promise<string | null> {
  const encryptionKey = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!encryptionKey) return null;

  const db = getDb();
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.id, "default"))
    .limit(1);

  const encrypted = rows[0]?.internalPmAccessTokenEncrypted;
  if (!encrypted) return null;

  try {
    return decryptSecret(encrypted, encryptionKey);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const stored = await getStoredToken();
  const envFallback = Boolean(process.env.INTERNAL_PM_ACCESS_TOKEN);

  return Response.json({
    hasToken: Boolean(stored) || envFallback,
    tokenSource: stored ? "database" : envFallback ? "env" : "none",
    maskedToken: stored
      ? maskToken(stored)
      : envFallback
        ? maskToken(process.env.INTERNAL_PM_ACCESS_TOKEN!)
        : null,
    internalPmBaseUrl: process.env.INTERNAL_PM_BASE_URL || null,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const encryptionKey = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!encryptionKey) {
    return Response.json(
      { error: "SETTINGS_ENCRYPTION_KEY is not configured" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = settingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const encrypted = encryptSecret(
    parsed.data.internalPmAccessToken,
    encryptionKey,
  );

  const db = getDb();
  await db
    .insert(settings)
    .values({
      id: "default",
      internalPmAccessTokenEncrypted: encrypted,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        internalPmAccessTokenEncrypted: encrypted,
        updatedAt: new Date(),
      },
    });

  return Response.json({
    ok: true,
    maskedToken: maskToken(parsed.data.internalPmAccessToken),
  });
}
