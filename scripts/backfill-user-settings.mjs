#!/usr/bin/env node
/**
 * Create `user_settings` and copy GitHub/sync fields from `users` before
 * drizzle-kit push drops those columns.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const url =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.NEON_PROXY_DATABASE_URL;

if (!url) {
  console.log("[backfill-user-settings] No database URL set; skipping.");
  process.exit(0);
}

const sqlPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../drizzle/0016_user_settings.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(sql);
  console.log("[backfill-user-settings] user_settings backfill complete.");
} catch (err) {
  console.error("[backfill-user-settings] Failed:", err);
  process.exit(1);
} finally {
  await client.end();
}
