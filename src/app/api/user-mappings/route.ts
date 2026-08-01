import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { userMappings } from "@/db/schema";
import { requireAdminAuth } from "@/lib/admin-auth";
import {
  userMappingCreateSchema,
  userMappingUpdateSchema,
} from "@/lib/validators";

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const db = getDb();
  const rows = await db
    .select()
    .from(userMappings)
    .orderBy(desc(userMappings.updatedAt));

  return Response.json({ mappings: rows });
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = userMappingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  try {
    const [row] = await db
      .insert(userMappings)
      .values({
        jiraDisplayName: parsed.data.jiraDisplayName,
        jiraAccountId: parsed.data.jiraAccountId ?? null,
        bitmapUserId: parsed.data.bitmapUserId,
        bitmapEmail: parsed.data.bitmapEmail ?? null,
        jobTitle: parsed.data.jobTitle ?? null,
        enabled: parsed.data.enabled,
      })
      .returning();

    return Response.json({ mapping: row }, { status: 201 });
  } catch (err) {
    console.error("[user-mappings] create failed", err);
    return Response.json(
      {
        error:
          "Failed to create user mapping (possibly duplicate display name)",
      },
      { status: 409 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id query param is required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = userMappingUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [row] = await db
    .update(userMappings)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(userMappings.id, id))
    .returning();

  if (!row) {
    return Response.json({ error: "User mapping not found" }, { status: 404 });
  }

  return Response.json({ mapping: row });
}

export async function DELETE(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id query param is required" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .delete(userMappings)
    .where(eq(userMappings.id, id))
    .returning();

  if (!row) {
    return Response.json({ error: "User mapping not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
