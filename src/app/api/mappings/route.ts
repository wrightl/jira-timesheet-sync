import { NextRequest } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/auth";
import { parseJsonBody, requireUuidParam } from "@/lib/api";
import { mappingCreateSchema, mappingUpdateSchema } from "@/lib/validators";
import { createSpaceMappingService } from "@/services/space-mapping-service";
import { log } from "@/lib/log";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const mappings = await createSpaceMappingService().list();
  return Response.json({ mappings });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(request, mappingCreateSchema);
  if ("error" in parsed) return parsed.error;

  const result = await createSpaceMappingService().create(parsed.data);
  if ("error" in result) {
    log.error("mappings", new Error("create conflict"));
    return Response.json(
      { error: "Failed to create mapping (possibly duplicate space key)" },
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

  const parsed = await parseJsonBody(request, mappingUpdateSchema);
  if ("error" in parsed) return parsed.error;

  const result = await createSpaceMappingService().update(
    idParam.value,
    parsed.data,
  );
  if ("error" in result) {
    return Response.json({ error: "Mapping not found" }, { status: 404 });
  }

  return Response.json({ mapping: result.mapping });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const idParam = requireUuidParam(new URL(request.url).searchParams);
  if ("error" in idParam) return idParam.error;

  const result = await createSpaceMappingService().delete(idParam.value);
  if ("error" in result) {
    return Response.json({ error: "Mapping not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
