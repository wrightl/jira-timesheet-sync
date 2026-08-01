import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function requireAdminAuth(request: NextRequest): Response | null {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    return Response.json(
      { error: "ADMIN_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const header = request.headers.get("authorization");
  const cookie = request.cookies.get("admin_api_key")?.value;
  let provided: string | null = null;

  if (header?.startsWith("Bearer ")) {
    provided = header.slice(7).trim();
  } else if (cookie) {
    provided = cookie;
  }

  if (!provided || !safeEqual(provided, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
