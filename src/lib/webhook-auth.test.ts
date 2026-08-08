import { describe, expect, it } from "vitest";
import {
  hashPayload,
  verifyHubSignature,
  verifyWebhookToken,
} from "@/lib/webhook-auth";

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

describe("verifyHubSignature", () => {
  // Atlassian reference vector:
  // https://developer.atlassian.com/cloud/jira/platform/webhooks/
  const secret = "It's a Secret to Everybody";
  const body = "Hello World!";
  const validHeader =
    "sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9";

  it("accepts the Atlassian reference signature", () => {
    expect(verifyHubSignature(validHeader, body, secret)).toBe(true);
  });

  it("rejects a wrong secret", () => {
    expect(verifyHubSignature(validHeader, body, "wrong-secret")).toBe(false);
  });

  it("rejects a wrong body", () => {
    expect(verifyHubSignature(validHeader, "Goodbye World!", secret)).toBe(
      false,
    );
  });

  it("rejects missing or empty headers", () => {
    expect(verifyHubSignature(null, body, secret)).toBe(false);
    expect(verifyHubSignature(undefined, body, secret)).toBe(false);
    expect(verifyHubSignature("", body, secret)).toBe(false);
  });

  it("rejects non-sha256 headers", () => {
    expect(
      verifyHubSignature(
        "sha1=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9",
        body,
        secret,
      ),
    ).toBe(false);
  });

  it("rejects malformed hex", () => {
    expect(verifyHubSignature("sha256=not-hex", body, secret)).toBe(false);
    expect(verifyHubSignature("sha256=abc", body, secret)).toBe(false);
  });

  it("rejects an empty secret", () => {
    expect(verifyHubSignature(validHeader, body, "")).toBe(false);
  });
});

describe("hashPayload", () => {
  it("returns a stable sha256 hex digest", () => {
    expect(hashPayload("abc")).toBe(hashPayload("abc"));
    expect(hashPayload("abc")).not.toBe(hashPayload("abd"));
    expect(hashPayload("abc")).toMatch(/^[a-f0-9]{64}$/);
  });
});
