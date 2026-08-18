import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { sessionTokenFromRequest } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/password";

function requestWith(
  init?: ConstructorParameters<typeof NextRequest>[1],
): NextRequest {
  return new NextRequest("http://localhost/api/auth/me", init);
}

describe("sessionTokenFromRequest", () => {
  it("reads the session cookie", () => {
    const request = requestWith({
      headers: { cookie: `${SESSION_COOKIE}=cookie-token` },
    });
    expect(sessionTokenFromRequest(request)).toBe("cookie-token");
  });

  it("reads a Bearer token when no cookie is present", () => {
    const request = requestWith({
      headers: { authorization: "Bearer bearer-token" },
    });
    expect(sessionTokenFromRequest(request)).toBe("bearer-token");
  });

  it("prefers the cookie over Authorization", () => {
    const request = requestWith({
      headers: {
        cookie: `${SESSION_COOKIE}=cookie-token`,
        authorization: "Bearer bearer-token",
      },
    });
    expect(sessionTokenFromRequest(request)).toBe("cookie-token");
  });

  it("returns undefined when neither is present", () => {
    expect(sessionTokenFromRequest(requestWith())).toBeUndefined();
  });
});
