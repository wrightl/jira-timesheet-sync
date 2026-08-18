#!/usr/bin/env node
/**
 * Sync the database schema during Vercel/CI builds.
 *
 * This project historically used `drizzle-kit push` (no
 * `__drizzle_migrations` journal on Neon). Running `drizzle-kit migrate`
 * against that database fails because it tries to re-apply 0000_init on
 * tables that already exist.
 *
 * `push --force` is idempotent and matches local/cloud start scripts.
 */
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local" });

const url =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.NEON_PROXY_DATABASE_URL;

if (!url) {
  console.log("[migrate-on-build] No database URL set; skipping schema sync.");
  process.exit(0);
}

console.log("[migrate-on-build] Backfilling user_settings…");
const backfill = spawnSync("node", ["scripts/backfill-user-settings.mjs"], {
  stdio: "inherit",
  env: process.env,
});
if (backfill.status !== 0) {
  console.error("[migrate-on-build] user_settings backfill failed.");
  process.exit(backfill.status ?? 1);
}

console.log("[migrate-on-build] Syncing schema with drizzle-kit push…");
const result = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  console.error("[migrate-on-build] Schema sync failed.");
  process.exit(result.status ?? 1);
}

console.log("[migrate-on-build] Schema sync complete.");
