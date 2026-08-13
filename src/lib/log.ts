export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const LEVELS = new Set<string>(["debug", "info", "warn", "error"]);

function parseLogLevel(value: string | undefined): LogLevel | undefined {
  if (!value) return undefined;
  const normalised = value.trim().toLowerCase();
  return LEVELS.has(normalised) ? (normalised as LogLevel) : undefined;
}

function defaultLogLevel(): LogLevel {
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/** Resolve effective log level (env override, else prod=info / else=debug). */
export function getLogLevel(): LogLevel {
  return parseLogLevel(process.env.LOG_LEVEL) ?? defaultLogLevel();
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[getLogLevel()];
}

function isJsonMode(): boolean {
  return process.env.NODE_ENV === "production";
}

function safeFields(fields?: LogFields): LogFields | undefined {
  if (!fields) return undefined;
  try {
    // Ensure fields are JSON-serializable for stable output.
    return JSON.parse(JSON.stringify(fields)) as LogFields;
  } catch {
    return { _fieldsError: "unserializable" };
  }
}

function formatDevValue(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") {
    return /\s/.test(value) ? JSON.stringify(value) : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatDevLine(
  level: LogLevel,
  scope: string,
  message: string,
  fields?: LogFields,
): string {
  const levelLabel = level.toUpperCase();
  const parts: string[] = [`${levelLabel} [${scope}] ${message}`];
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      parts.push(`${key}=${formatDevValue(value)}`);
    }
  }
  return parts.join(" ");
}

function emit(
  level: LogLevel,
  scope: string,
  message: string,
  fields?: LogFields,
  err?: unknown,
): void {
  if (!shouldLog(level)) return;

  const safe = safeFields(fields);
  const ts = new Date().toISOString();

  if (isJsonMode()) {
    const entry: Record<string, unknown> = {
      level,
      scope,
      message,
      ts,
      ...(safe ?? {}),
    };
    if (err instanceof Error && err.stack) {
      entry.stack = err.stack;
    }
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
    return;
  }

  const line = formatDevLine(level, scope, message, safe);
  if (level === "error") {
    if (err !== undefined) console.error(line, err);
    else console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export const log = {
  debug(scope: string, message: string, fields?: LogFields) {
    emit("debug", scope, message, fields);
  },
  info(scope: string, message: string, fields?: LogFields) {
    emit("info", scope, message, fields);
  },
  warn(scope: string, message: string, fields?: LogFields) {
    emit("warn", scope, message, fields);
  },
  error(scope: string, err: unknown, fields?: LogFields) {
    const message = err instanceof Error ? err.message : String(err);
    emit("error", scope, message, fields, err);
  },
};
