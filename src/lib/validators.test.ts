import { describe, expect, it } from "vitest";
import {
  mappingCreateSchema,
  mappingUpdateSchema,
  settingsUpdateSchema,
  userMappingCreateSchema,
  userMappingUpdateSchema,
  adminUserCreateSchema,
  adminUserUpdateSchema,
  meUpdateSchema,
} from "@/lib/validators";

describe("mappingCreateSchema", () => {
  it("accepts a valid mapping and defaults enabled", () => {
    const result = mappingCreateSchema.parse({
      jiraSpaceKey: "ENG",
      clientId: "client-1",
    });
    expect(result.enabled).toBe(true);
  });

  it("rejects missing fields", () => {
    const result = mappingCreateSchema.safeParse({
      jiraSpaceKey: "",
      clientId: "client-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("mappingUpdateSchema", () => {
  it("allows partial updates", () => {
    expect(mappingUpdateSchema.parse({ enabled: false })).toEqual({
      enabled: false,
    });
  });
});

describe("userMappingCreateSchema", () => {
  it("accepts a valid user mapping", () => {
    const result = userMappingCreateSchema.parse({
      jiraDisplayName: "Ada Lovelace",
      bitmapUserId: "bitmap-1",
    });
    expect(result.enabled).toBe(true);
    expect(result.jiraDisplayName).toBe("Ada Lovelace");
  });

  it("rejects missing bitmap user id", () => {
    expect(
      userMappingCreateSchema.safeParse({
        jiraDisplayName: "Ada",
        bitmapUserId: "",
      }).success,
    ).toBe(false);
  });
});

describe("userMappingUpdateSchema", () => {
  it("allows partial updates", () => {
    expect(userMappingUpdateSchema.parse({ jobTitle: "QA Engineer" })).toEqual({
      jobTitle: "QA Engineer",
    });
  });
});

describe("settingsUpdateSchema", () => {
  it("requires a non-empty token", () => {
    expect(settingsUpdateSchema.safeParse({ internalPmAccessToken: "" }).success).toBe(
      false,
    );
    expect(
      settingsUpdateSchema.parse({ internalPmAccessToken: "tok_abc" }),
    ).toEqual({ internalPmAccessToken: "tok_abc" });
  });
});

describe("adminUserCreateSchema", () => {
  it("defaults role to user", () => {
    const result = adminUserCreateSchema.parse({
      email: "a@b.com",
      password: "longenough",
    });
    expect(result.role).toBe("user");
  });

  it("rejects short passwords", () => {
    expect(
      adminUserCreateSchema.safeParse({
        email: "a@b.com",
        password: "short",
      }).success,
    ).toBe(false);
  });
});

describe("adminUserUpdateSchema", () => {
  it("requires role, password, or syncEnabled", () => {
    expect(adminUserUpdateSchema.safeParse({}).success).toBe(false);
    expect(adminUserUpdateSchema.parse({ role: "admin" })).toEqual({
      role: "admin",
    });
    expect(
      adminUserUpdateSchema.parse({ password: "longenough" }),
    ).toEqual({ password: "longenough" });
    expect(adminUserUpdateSchema.parse({ syncEnabled: false })).toEqual({
      syncEnabled: false,
    });
  });
});

describe("meUpdateSchema", () => {
  it("requires syncEnabled boolean", () => {
    expect(meUpdateSchema.safeParse({}).success).toBe(false);
    expect(meUpdateSchema.parse({ syncEnabled: true })).toEqual({
      syncEnabled: true,
    });
    expect(meUpdateSchema.parse({ syncEnabled: false })).toEqual({
      syncEnabled: false,
    });
  });
});
