import { describe, expect, it } from "vitest";
import {
  matchesBearerSecret,
  timingSafeStringEqual,
} from "@/lib/timing-safe";

describe("timingSafeStringEqual", () => {
  it("accepts equal strings", () => {
    expect(timingSafeStringEqual("secret-value", "secret-value")).toBe(true);
  });

  it("rejects mismatched or missing values", () => {
    expect(timingSafeStringEqual("wrong", "secret-value")).toBe(false);
    expect(timingSafeStringEqual(null, "secret")).toBe(false);
    expect(timingSafeStringEqual("secret", "")).toBe(false);
    expect(timingSafeStringEqual("abc", "abcd")).toBe(false);
  });
});

describe("matchesBearerSecret", () => {
  it("accepts a matching Bearer token", () => {
    expect(matchesBearerSecret("Bearer cron-secret", "cron-secret")).toBe(true);
  });

  it("rejects a wrong token", () => {
    expect(matchesBearerSecret("Bearer other-secret", "cron-secret")).toBe(
      false,
    );
  });

  it("fails closed when the secret is unset", () => {
    expect(matchesBearerSecret("Bearer cron-secret", undefined)).toBe(false);
    expect(matchesBearerSecret("Bearer cron-secret", "")).toBe(false);
    expect(matchesBearerSecret("Bearer cron-secret", null)).toBe(false);
  });
});
