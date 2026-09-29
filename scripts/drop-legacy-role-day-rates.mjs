#!/usr/bin/env node
/**
 * Remove the free-form role_day_rates table before drizzle-kit push.
 *
 * Push treats a deleted table and a new table as a possible rename and asks
 * which to do. That prompt cannot run in CI. The old rows are one rate per
 * free-form title with no effective month, so they are not copied into
 * role_day_rate_schedules.
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const url =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.NEON_PROXY_DATABASE_URL;

if (!url) {
  console.log("[drop-legacy-role-day-rates] No database URL set; skipping.");
  process.exit(0);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('DROP TABLE IF EXISTS "role_day_rates"');
  console.log("[drop-legacy-role-day-rates] role_day_rates removed if present.");
} catch (err) {
  console.error("[drop-legacy-role-day-rates] Failed:", err);
  process.exit(1);
} finally {
  await client.end();
}
