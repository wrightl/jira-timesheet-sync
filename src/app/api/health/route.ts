import { getDb } from "@/db";
import { SettingsRepository } from "@/repositories/settings-repository";
import { log } from "@/lib/log";

export async function GET() {
  let database: "ok" | "error" = "ok";
  try {
    const settings = new SettingsRepository(getDb());
    await settings.getDefault();
  } catch (err) {
    database = "error";
    log.warn("health", "database check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return Response.json({
    status: database === "ok" ? "ok" : "degraded",
    service: "jira-timesheet-sync",
    database,
    timestamp: new Date().toISOString(),
  });
}
