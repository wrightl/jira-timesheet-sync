import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSpaceMappingDiscoveryService } from "@/services/space-mapping-discovery";
import { log } from "@/lib/log";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const result = await createSpaceMappingDiscoveryService().discoverAndCreateMissing();
    return Response.json({
      created: result.created,
      createdCount: result.created.length,
      skippedExisting: result.skippedExisting,
      skippedUnparseable: result.skippedUnparseable,
      conflicts: result.conflicts,
    });
  } catch (err) {
    log.error("mappings-discover", err);
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to discover mappings",
      },
      { status: 500 },
    );
  }
}
