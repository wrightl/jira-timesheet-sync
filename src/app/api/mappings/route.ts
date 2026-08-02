import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { spaceProjectMappings } from "@/db/schema";
import { requireAdmin, requireAuth } from "@/lib/auth";
import { mappingCreateSchema, mappingUpdateSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const db = getDb();
  const rows = await db
    .select()
    .from(spaceProjectMappings)
    .orderBy(desc(spaceProjectMappings.updatedAt));

  return Response.json({ mappings: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = mappingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  try {
    const [row] = await db
      .insert(spaceProjectMappings)
      .values({
        jiraSpaceKey: parsed.data.jiraSpaceKey,
        clientId: parsed.data.clientId,
        enabled: parsed.data.enabled,
      })
      .returning();

    return Response.json({ mapping: row }, { status: 201 });
  } catch (err) {
    console.error("[mappings] create failed", err);
    return Response.json(
      { error: "Failed to create mapping (possibly duplicate space key)" },
      { status: 409 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

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

  const parsed = mappingUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [row] = await db
    .update(spaceProjectMappings)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(spaceProjectMappings.id, id))
    .returning();

  if (!row) {
    return Response.json({ error: "Mapping not found" }, { status: 404 });
  }

  return Response.json({ mapping: row });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id query param is required" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .delete(spaceProjectMappings)
    .where(eq(spaceProjectMappings.id, id))
    .returning();

  if (!row) {
    return Response.json({ error: "Mapping not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
