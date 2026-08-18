import { describe, expect, it } from "vitest";
import { profileFromGooglePayload } from "@/lib/google-id-token";

describe("profileFromGooglePayload", () => {
  it("maps a verified Google ID token payload", () => {
    expect(
      profileFromGooglePayload({
        sub: "google-sub",
        email: "ada@example.com",
        email_verified: true,
        hd: "example.com",
      }),
    ).toEqual({
      sub: "google-sub",
      email: "ada@example.com",
      email_verified: true,
      hd: "example.com",
    });
  });

  it("rejects unverified email", () => {
    expect(() =>
      profileFromGooglePayload({
        sub: "google-sub",
        email: "ada@example.com",
        email_verified: false,
      }),
    ).toThrow(/not verified/);
  });
});
