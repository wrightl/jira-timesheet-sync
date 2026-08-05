import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createBitmapResolverService } from "@/services/bitmap-resolver";
import { createSettingsService } from "@/services/settings-service";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ error: "projectId is required" }, { status: 400 });
  }

  try {
    const settings = createSettingsService();
    const api = await settings.createConfiguredBitmapClient();
    const budgets =
      await createBitmapResolverService().resolveBudgetsForProject(
        api,
        projectId,
      );
    return Response.json({ budgets });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load budgets";
    return Response.json({ error: message }, { status: 502 });
  }
}
