import { describe, expect, it, beforeEach } from "vitest";
import {
  authAttemptKey,
  clearAuthFailures,
  isAuthRateLimited,
  recordAuthFailure,
  requestClientIp,
  resetAuthRateLimitForTests,
} from "@/lib/rate-limit";

describe("rate-limit", () => {
  beforeEach(() => {
    resetAuthRateLimitForTests();
  });

  it("parses the first X-Forwarded-For hop", () => {
    const request = new Request("http://localhost/api/auth/login", {
      headers: { "x-forwarded-for": " 1.1.1.1, 2.2.2.2" },
    });
    expect(requestClientIp(request)).toBe("1.1.1.1");
  });

  it("limits after 8 failures in the window", () => {
    const key = authAttemptKey("Ada@Example.com", "1.1.1.1");
    expect(key).toBe("ada@example.com|1.1.1.1");
    for (let i = 0; i < 8; i += 1) {
      expect(isAuthRateLimited(key)).toBe(false);
      recordAuthFailure(key);
    }
    expect(isAuthRateLimited(key)).toBe(true);
  });

  it("clears failures after success", () => {
    const key = authAttemptKey("ada@example.com", "1.1.1.1");
    for (let i = 0; i < 8; i += 1) recordAuthFailure(key);
    expect(isAuthRateLimited(key)).toBe(true);
    clearAuthFailures(key);
    expect(isAuthRateLimited(key)).toBe(false);
  });
});
