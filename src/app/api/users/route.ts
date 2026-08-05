import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody, requireUuidParam } from "@/lib/api";
import {
  adminUserCreateSchema,
  adminUserUpdateSchema,
} from "@/lib/validators";
import { createUsersService } from "@/services/users-service";
import { log } from "@/lib/log";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const users = await createUsersService().list();
  return Response.json({ users });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(request, adminUserCreateSchema);
  if ("error" in parsed) return parsed.error;

  const result = await createUsersService().create(parsed.data);
  if ("error" in result) {
    const status = result.error.code === "conflict" ? 409 : 400;
    if (result.error.code === "conflict") {
      log.error("users", new Error(result.error.message));
    }
    return Response.json({ error: result.error.message }, { status });
  }

  return Response.json({ user: result.user }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const idParam = requireUuidParam(new URL(request.url).searchParams);
  if ("error" in idParam) return idParam.error;

  const parsed = await parseJsonBody(request, adminUserUpdateSchema);
  if ("error" in parsed) return parsed.error;

  const result = await createUsersService().update(
    idParam.value,
    parsed.data,
    auth.user.id,
  );
  if ("error" in result) {
    const status =
      result.error.code === "not_found"
        ? 404
        : result.error.code === "conflict"
          ? 409
          : 400;
    return Response.json({ error: result.error.message }, { status });
  }

  return Response.json({ user: result.user });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const idParam = requireUuidParam(new URL(request.url).searchParams);
  if ("error" in idParam) return idParam.error;

  const result = await createUsersService().delete(
    idParam.value,
    auth.user.id,
  );
  if ("error" in result) {
    const status = result.error.code === "not_found" ? 404 : 400;
    return Response.json({ error: result.error.message }, { status });
  }

  return Response.json({ ok: true });
}
