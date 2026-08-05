import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  createBitmapResolverService,
  projectDateRangeFromStarted,
} from "@/services/bitmap-resolver";
import { createSettingsService } from "@/services/settings-service";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) {
    return Response.json({ error: "clientId is required" }, { status: 400 });
  }

  const started = searchParams.get("started") ?? new Date().toISOString();

  try {
    const settings = createSettingsService();
    const api = await settings.createConfiguredBitmapClient();
    const { rangeStart, rangeEnd } = projectDateRangeFromStarted(started);
    const projects = await createBitmapResolverService().resolveProjectsForClient(
      api,
      clientId,
      rangeStart,
      rangeEnd,
    );
    return Response.json({ projects, rangeStart, rangeEnd });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load projects";
    return Response.json({ error: message }, { status: 502 });
  }
}
