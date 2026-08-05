import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { parseJsonBody, requireUuidParam } from "@/lib/api";
import {
  userSpaceMappingCreateSchema,
  userSpaceMappingUpdateSchema,
} from "@/lib/validators";
import { createUserSpaceMappingService } from "@/services/user-space-mapping-service";
import { log } from "@/lib/log";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const filterUserId = searchParams.get("userId");
  if (filterUserId) {
    const parsed = z.string().uuid().safeParse(filterUserId);
    if (!parsed.success) {
      return Response.json(
        { error: "userId must be a valid UUID" },
        { status: 400 },
      );
    }
  }

  const mappings = await createUserSpaceMappingService().listForViewer({
    viewerId: auth.user.id,
    viewerRole: auth.user.role,
    filterUserId,
    all: searchParams.get("all") === "1",
  });

  return Response.json({ mappings });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(request, userSpaceMappingCreateSchema);
  if ("error" in parsed) return parsed.error;

  let targetUserId = auth.user.id;
  if (parsed.data.userId && parsed.data.userId !== auth.user.id) {
    if (auth.user.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    targetUserId = parsed.data.userId;
  }

  const result = await createUserSpaceMappingService().create(
    targetUserId,
    parsed.data,
  );
  if ("error" in result) {
    log.error("user-space-mappings", new Error("create conflict"));
    return Response.json(
      {
        error:
          "Failed to create mapping (possibly duplicate space for this user)",
      },
      { status: 409 },
    );
  }

  return Response.json({ mapping: result.mapping }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const idParam = requireUuidParam(new URL(request.url).searchParams);
  if ("error" in idParam) return idParam.error;

  const parsed = await parseJsonBody(request, userSpaceMappingUpdateSchema);
  if ("error" in parsed) return parsed.error;

  const result = await createUserSpaceMappingService().update(
    idParam.value,
    parsed.data,
    auth.user,
  );
  if ("error" in result) {
    if (result.error === "forbidden") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return Response.json({ error: "Mapping not found" }, { status: 404 });
  }

  return Response.json({ mapping: result.mapping });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const idParam = requireUuidParam(new URL(request.url).searchParams);
  if ("error" in idParam) return idParam.error;

  const result = await createUserSpaceMappingService().delete(
    idParam.value,
    auth.user,
  );
  if ("error" in result) {
    if (result.error === "forbidden") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return Response.json({ error: "Mapping not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
