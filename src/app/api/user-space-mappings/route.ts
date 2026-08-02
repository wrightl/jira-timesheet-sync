import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { userSpaceMappings } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import {
  userSpaceMappingCreateSchema,
  userSpaceMappingUpdateSchema,
} from "@/lib/validators";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const filterUserId = searchParams.get("userId");
  const db = getDb();

  if (auth.user.role === "admin" && filterUserId) {
    const rows = await db
      .select()
      .from(userSpaceMappings)
      .where(eq(userSpaceMappings.userId, filterUserId))
      .orderBy(desc(userSpaceMappings.updatedAt));
    return Response.json({ mappings: rows });
  }

  if (auth.user.role === "admin" && searchParams.get("all") === "1") {
    const rows = await db
      .select()
      .from(userSpaceMappings)
      .orderBy(desc(userSpaceMappings.updatedAt));
    return Response.json({ mappings: rows });
  }

  const rows = await db
    .select()
    .from(userSpaceMappings)
    .where(eq(userSpaceMappings.userId, auth.user.id))
    .orderBy(desc(userSpaceMappings.updatedAt));

  return Response.json({ mappings: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = userSpaceMappingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let targetUserId = auth.user.id;
  if (parsed.data.userId && parsed.data.userId !== auth.user.id) {
    if (auth.user.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    targetUserId = parsed.data.userId;
  }

  const db = getDb();
  try {
    const [row] = await db
      .insert(userSpaceMappings)
      .values({
        userId: targetUserId,
        jiraSpaceKey: parsed.data.jiraSpaceKey,
        clientId: parsed.data.clientId,
        projectId: parsed.data.projectId,
        projectBudgetId: parsed.data.projectBudgetId,
        projectName: parsed.data.projectName ?? null,
        budgetName: parsed.data.budgetName ?? null,
        enabled: parsed.data.enabled,
      })
      .returning();

    return Response.json({ mapping: row }, { status: 201 });
  } catch (err) {
    console.error("[user-space-mappings] create failed", err);
    return Response.json(
      {
        error:
          "Failed to create mapping (possibly duplicate space for this user)",
      },
      { status: 409 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
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

  const parsed = userSpaceMappingUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(userSpaceMappings)
    .where(eq(userSpaceMappings.id, id))
    .limit(1);

  if (!existing[0]) {
    return Response.json({ error: "Mapping not found" }, { status: 404 });
  }

  if (
    existing[0].userId !== auth.user.id &&
    auth.user.role !== "admin"
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [row] = await db
    .update(userSpaceMappings)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(userSpaceMappings.id, id))
    .returning();

  return Response.json({ mapping: row });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id query param is required" }, { status: 400 });
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(userSpaceMappings)
    .where(eq(userSpaceMappings.id, id))
    .limit(1);

  if (!existing[0]) {
    return Response.json({ error: "Mapping not found" }, { status: 404 });
  }

  if (
    existing[0].userId !== auth.user.id &&
    auth.user.role !== "admin"
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(userSpaceMappings).where(eq(userSpaceMappings.id, id));
  return Response.json({ ok: true });
}
