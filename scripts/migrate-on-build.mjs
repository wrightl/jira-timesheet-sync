#!/usr/bin/env node
/**
 * Run pending Drizzle migrations when a database URL is available (Vercel builds).
 * Skips cleanly when no DB is configured so local `next build` still works.
 */
import { spawnSync } from "node:child_process";

const url =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.NEON_PROXY_DATABASE_URL;

if (!url) {
  console.log("[migrate-on-build] No database URL set; skipping migrations.");
  process.exit(0);
}

console.log("[migrate-on-build] Applying pending Drizzle migrations…");
const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  console.error("[migrate-on-build] Migration failed.");
  process.exit(result.status ?? 1);
}

console.log("[migrate-on-build] Migrations complete.");
