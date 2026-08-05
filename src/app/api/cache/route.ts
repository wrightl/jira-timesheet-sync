import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { requireUuidParam } from "@/lib/api";
import { createApiCacheService } from "@/services/api-cache";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const includeBody =
    new URL(request.url).searchParams.get("includeBody") === "1";
  const entries = await createApiCacheService().list(includeBody);
  return Response.json({ entries });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "1";
  const service = createApiCacheService();

  if (all) {
    const result = await service.deleteAll();
    return Response.json(result);
  }

  const idParam = requireUuidParam(searchParams);
  if ("error" in idParam) {
    return Response.json(
      { error: "id query param or all=1 is required" },
      { status: 400 },
    );
  }

  const result = await service.deleteById(idParam.value);
  if ("error" in result) {
    return Response.json({ error: "Cache entry not found" }, { status: 404 });
  }

  return Response.json(result);
}
