import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createGithubSettingsService } from "@/services/github-settings-service";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const configured = await createGithubSettingsService().createConfiguredClient(
    auth.user.id,
  );
  if (!configured) {
    return Response.json(
      { error: "GitHub is not configured" },
      { status: 400 },
    );
  }

  try {
    const repos = await configured.client.listOrganizationRepos(configured.org);
    return Response.json({ org: configured.org, repos });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to list repositories",
      },
      { status: 502 },
    );
  }
}
