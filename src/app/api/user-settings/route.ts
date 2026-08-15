import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { userSettingsUpdateSchema } from "@/lib/validators";
import { createUserSettingsService } from "@/services/user-settings-service";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const status = await createUserSettingsService().getStatus(auth.user.id);
  return Response.json(status);
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(request, userSettingsUpdateSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const status = await createUserSettingsService().saveSettings(
      auth.user.id,
      {
        token: parsed.data.githubToken,
        org: parsed.data.githubOrg,
        githubRepos: parsed.data.githubRepos,
        syncEnabled: parsed.data.syncEnabled,
      },
    );
    return Response.json({ ok: true, ...status });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save settings";
    const statusCode = message.includes("SETTINGS_ENCRYPTION_KEY")
      ? 500
      : message.includes("User not found")
        ? 404
        : 400;
    return Response.json({ error: message }, { status: statusCode });
  }
}
