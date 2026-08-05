import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_URL_UNPOOLED: optionalString,
  JIRA_WEBHOOK_SECRET: optionalString,
  INTERNAL_PM_ACCESS_TOKEN: optionalString,
  INTERNAL_PM_BASE_URL: optionalString,
  SETTINGS_ENCRYPTION_KEY: optionalString,
  ALLOW_PUBLIC_REGISTER: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  LOG_LEVEL: z.preprocess(
    (v) => (typeof v === "string" && v.length > 0 ? v : undefined),
    z.enum(["debug", "info", "warn", "error"]).optional(),
  ),
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
    );
  }
  cached = parsed.data;
  return cached;
}

/** Test helper to clear cached env. */
export function resetEnvCache() {
  cached = null;
}

export function requireDatabaseUrl(): string {
  const url = getEnv().DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export function allowPublicRegister(): boolean {
  return Boolean(getEnv().ALLOW_PUBLIC_REGISTER);
}
