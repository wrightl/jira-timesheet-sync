import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { meUpdateSchema } from "@/lib/validators";
import { createUsersService } from "@/services/users-service";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const result = await createUsersService().getPublicById(auth.user.id);
  if ("error" in result) {
    return Response.json({ error: result.error.message }, { status: 404 });
  }

  return Response.json({ user: result.user });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(request, meUpdateSchema);
  if ("error" in parsed) return parsed.error;

  const result = await createUsersService().updateMe(
    auth.user.id,
    parsed.data,
  );
  if ("error" in result) {
    return Response.json({ error: result.error.message }, { status: 404 });
  }

  return Response.json({ user: result.user });
}
