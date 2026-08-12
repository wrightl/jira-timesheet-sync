import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { githubSettingsUpdateSchema } from "@/lib/validators";
import { createGithubSettingsService } from "@/services/github-settings-service";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const status = await createGithubSettingsService().getStatus(auth.user.id);
  return Response.json(status);
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(request, githubSettingsUpdateSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const status = await createGithubSettingsService().saveSettings(
      auth.user.id,
      {
        token: parsed.data.githubToken,
        org: parsed.data.githubOrg,
      },
    );
    return Response.json({ ok: true, ...status });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save GitHub settings";
    const statusCode = message.includes("SETTINGS_ENCRYPTION_KEY")
      ? 500
      : message.includes("User not found")
        ? 404
        : 400;
    return Response.json({ error: message }, { status: statusCode });
  }
}
