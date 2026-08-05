import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { settingsUpdateSchema } from "@/lib/validators";
import { createSettingsService } from "@/services/settings-service";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const status = await createSettingsService().getStatus();
  return Response.json(status);
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(request, settingsUpdateSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const result = await createSettingsService().saveAccessToken(
      parsed.data.internalPmAccessToken,
    );
    return Response.json({ ok: true, maskedToken: result.maskedToken });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save settings";
    const status = message.includes("SETTINGS_ENCRYPTION_KEY") ? 500 : 400;
    return Response.json({ error: message }, { status });
  }
}
