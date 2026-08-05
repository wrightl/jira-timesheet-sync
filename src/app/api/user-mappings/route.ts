import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody, requireUuidParam } from "@/lib/api";
import {
  userMappingCreateSchema,
  userMappingUpdateSchema,
} from "@/lib/validators";
import { createUserMappingService } from "@/services/user-mapping-service";
import { log } from "@/lib/log";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const mappings = await createUserMappingService().list();
  return Response.json({ mappings });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(request, userMappingCreateSchema);
  if ("error" in parsed) return parsed.error;

  const result = await createUserMappingService().create(parsed.data);
  if ("error" in result) {
    log.error("user-mappings", new Error("create conflict"));
    return Response.json(
      {
        error:
          "Failed to create user mapping (possibly duplicate display name)",
      },
      { status: 409 },
    );
  }

  return Response.json({ mapping: result.mapping }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const idParam = requireUuidParam(new URL(request.url).searchParams);
  if ("error" in idParam) return idParam.error;

  const parsed = await parseJsonBody(request, userMappingUpdateSchema);
  if ("error" in parsed) return parsed.error;

  const result = await createUserMappingService().update(
    idParam.value,
    parsed.data,
  );
  if ("error" in result) {
    return Response.json({ error: "User mapping not found" }, { status: 404 });
  }

  return Response.json({ mapping: result.mapping });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const idParam = requireUuidParam(new URL(request.url).searchParams);
  if ("error" in idParam) return idParam.error;

  const result = await createUserMappingService().delete(idParam.value);
  if ("error" in result) {
    return Response.json({ error: "User mapping not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
