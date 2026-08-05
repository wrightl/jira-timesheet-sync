/** Neon HTTP can flake under large parallel fan-out; retry transient fetch failures. */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const cause =
        err && typeof err === "object" && "cause" in err
          ? String((err as { cause?: unknown }).cause)
          : "";
      const transient =
        /fetch failed|connecting to database|network|ECONNRESET|ETIMEDOUT/i.test(
          `${message} ${cause}`,
        );
      if (!transient || attempt === attempts) throw err;
      await new Promise((r) => setTimeout(r, 150 * attempt));
    }
  }
  throw lastError;
}
