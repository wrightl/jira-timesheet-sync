import { describe, expect, it } from "vitest";
import { hashPayload, verifyWebhookToken } from "@/lib/webhook-auth";

describe("verifyWebhookToken", () => {
  it("accepts a matching token", () => {
    expect(verifyWebhookToken("secret-value", "secret-value")).toBe(true);
  });

  it("rejects a mismatched token", () => {
    expect(verifyWebhookToken("wrong", "secret-value")).toBe(false);
  });

  it("rejects missing or empty values", () => {
    expect(verifyWebhookToken(null, "secret")).toBe(false);
    expect(verifyWebhookToken(undefined, "secret")).toBe(false);
    expect(verifyWebhookToken("", "secret")).toBe(false);
    expect(verifyWebhookToken("secret", "")).toBe(false);
  });

  it("rejects tokens of different lengths", () => {
    expect(verifyWebhookToken("abc", "abcd")).toBe(false);
  });
});

describe("hashPayload", () => {
  it("returns a stable sha256 hex digest", () => {
    expect(hashPayload("abc")).toBe(hashPayload("abc"));
    expect(hashPayload("abc")).not.toBe(hashPayload("abd"));
    expect(hashPayload("abc")).toMatch(/^[a-f0-9]{64}$/);
  });
});
