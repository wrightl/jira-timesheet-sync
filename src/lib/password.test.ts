import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  normaliseEmail,
  verifyPassword,
} from "@/lib/password";
import {
  loginSchema,
  registerSchema,
  userSpaceMappingCreateSchema,
} from "@/lib/validators";

describe("normaliseEmail", () => {
  it("trims and lowercases", () => {
    expect(normaliseEmail("  Ada@Example.COM ")).toBe("ada@example.com");
  });
});

describe("password hashing", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("secret-pass");
    expect(hash).not.toBe("secret-pass");
    expect(await verifyPassword("secret-pass", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

describe("createSessionToken", () => {
  it("returns a long opaque token", () => {
    const token = createSessionToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
  });
});

describe("hashSessionToken", () => {
  it("returns a stable sha256 hex digest", () => {
    const token = "abc";
    const hashed = hashSessionToken(token);
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toBe(token);
    expect(hashSessionToken(token)).toBe(hashed);
  });
});

describe("loginSchema", () => {
  it("requires email and password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(
      true,
    );
    expect(loginSchema.safeParse({ email: "bad", password: "x" }).success).toBe(
      false,
    );
  });
});

describe("registerSchema", () => {
  it("requires min password length", () => {
    expect(
      registerSchema.safeParse({ email: "a@b.com", password: "short" }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ email: "a@b.com", password: "longenough" })
        .success,
    ).toBe(true);
  });
});

describe("userSpaceMappingCreateSchema", () => {
  it("accepts a valid user space mapping", () => {
    const result = userSpaceMappingCreateSchema.parse({
      jiraSpaceKey: "ENG",
      clientId: "client-1",
      projectId: "proj-1",
      projectBudgetId: "bud-1",
    });
    expect(result.enabled).toBe(true);
  });
});
