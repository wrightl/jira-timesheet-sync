import { z } from "zod";

export function validationError(error: z.ZodError): Response {
  return Response.json(
    { error: "Validation failed", details: error.flatten() },
    { status: 400 },
  );
}

export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      error: Response.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { error: validationError(parsed.error) };
  }

  return { data: parsed.data };
}

const uuidSchema = z.string().uuid();

export function requireUuidParam(
  searchParams: URLSearchParams,
  name = "id",
): { value: string } | { error: Response } {
  const raw = searchParams.get(name);
  if (!raw) {
    return {
      error: Response.json(
        { error: `${name} query param is required` },
        { status: 400 },
      ),
    };
  }
  const parsed = uuidSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: Response.json(
        { error: `${name} must be a valid UUID` },
        { status: 400 },
      ),
    };
  }
  return { value: parsed.data };
}

export function parseLimitParam(
  searchParams: URLSearchParams,
  defaultLimit = 20,
  max = 100,
): number {
  const raw = searchParams.get("limit");
  if (!raw) return defaultLimit;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return defaultLimit;
  return Math.min(Math.floor(n), max);
}

export function parseOffsetParam(
  searchParams: URLSearchParams,
  defaultOffset = 0,
): number {
  const raw = searchParams.get("offset");
  if (!raw) return defaultOffset;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return defaultOffset;
  return Math.floor(n);
}

export const uuidParamSchema = uuidSchema;
