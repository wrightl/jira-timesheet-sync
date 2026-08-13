import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

const url =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.NEON_PROXY_DATABASE_URL;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: url!,
  },
});
