/**
 * Shared script bootstrap: load dotenv then ensure DATABASE_URL is present.
 * Prefer `tsx --env-file=.env.local` in npm scripts; dotenv is a fallback.
 */
export function loadScriptEnv() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("dotenv").config();
  } catch {
    // optional when env already injected
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
}
