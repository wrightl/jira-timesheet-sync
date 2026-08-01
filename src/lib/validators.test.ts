import { describe, expect, it } from "vitest";
import {
  mappingCreateSchema,
  mappingUpdateSchema,
  settingsUpdateSchema,
} from "@/lib/validators";

describe("mappingCreateSchema", () => {
  it("accepts a valid mapping and defaults enabled", () => {
    const result = mappingCreateSchema.parse({
      jiraSpaceId: "10000",
      jiraSpaceKey: "ENG",
      internalProjectId: "proj-1",
    });
    expect(result.enabled).toBe(true);
  });

  it("rejects missing fields", () => {
    const result = mappingCreateSchema.safeParse({
      jiraSpaceId: "",
      jiraSpaceKey: "ENG",
      internalProjectId: "proj-1",
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
