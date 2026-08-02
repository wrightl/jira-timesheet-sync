import { count, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin, type AuthUser } from "@/lib/auth";
import { hashPassword, normalizeEmail } from "@/lib/password";
import {
  adminUserCreateSchema,
  adminUserUpdateSchema,
} from "@/lib/validators";

const publicUserColumns = {
  id: users.id,
  email: users.email,
  role: users.role,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

async function countAdmins(): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.role, "admin"));
  return Number(rows[0]?.value ?? 0);
}

function isRealUserId(user: AuthUser): boolean {
  return user.id !== "admin-api-key";
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const db = getDb();
  const rows = await db
    .select(publicUserColumns)
    .from(users)
    .orderBy(desc(users.updatedAt));

  return NextResponse.json({ users: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = adminUserCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const passwordHash = await hashPassword(parsed.data.password);
  const db = getDb();

  try {
    const [row] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        role: parsed.data.role,
      })
      .returning(publicUserColumns);

    return NextResponse.json({ user: row }, { status: 201 });
  } catch (err) {
    console.error("[users] create failed", err);
    return NextResponse.json(
      { error: "Email already registered" },
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
    return NextResponse.json(
      { error: "id query param is required" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = adminUserUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  const target = existing[0];
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (
    parsed.data.role &&
    parsed.data.role !== target.role &&
    isRealUserId(auth.user) &&
    auth.user.id === id
  ) {
    return NextResponse.json(
      { error: "You cannot change your own role" },
      { status: 400 },
    );
  }

  if (
    target.role === "admin" &&
    parsed.data.role === "user"
  ) {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Cannot demote the last remaining admin" },
        { status: 400 },
      );
    }
  }

  const updates: {
    role?: "admin" | "user";
    passwordHash?: string;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (parsed.data.role) {
    updates.role = parsed.data.role;
  }
  if (parsed.data.password) {
    updates.passwordHash = await hashPassword(parsed.data.password);
  }

  const [row] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, id))
    .returning(publicUserColumns);

  return NextResponse.json({ user: row });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "id query param is required" },
      { status: 400 },
    );
  }

  if (isRealUserId(auth.user) && auth.user.id === id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 },
    );
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  const target = existing[0];
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.role === "admin") {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last remaining admin" },
        { status: 400 },
      );
    }
  }

  await db.delete(users).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}
