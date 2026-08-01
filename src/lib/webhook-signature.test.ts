import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  hashPayload,
  verifyJiraWebhookSignature,
} from "@/lib/webhook-signature";

describe("verifyJiraWebhookSignature", () => {
  // Atlassian documented test vector
  it("accepts the official Atlassian sample signature", () => {
    const secret = "It's a Secret to Everybody";
    const payload = "Hello World!";
    const ok = verifyJiraWebhookSignature(
      payload,
      "sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9",
      secret,
    );
    expect(ok).toBe(true);
  });

  it("rejects a wrong signature", () => {
    const secret = "It's a Secret to Everybody";
    const payload = "Hello World!";
    const ok = verifyJiraWebhookSignature(
      payload,
      "sha256=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      secret,
    );
    expect(ok).toBe(false);
  });

  it("rejects missing or malformed headers", () => {
    expect(verifyJiraWebhookSignature("body", null, "secret")).toBe(false);
    expect(verifyJiraWebhookSignature("body", "md5=abc", "secret")).toBe(false);
    expect(verifyJiraWebhookSignature("body", "sha256=", "secret")).toBe(false);
  });

  it("verifies a freshly computed signature", () => {
    const secret = "test-secret";
    const payload = JSON.stringify({ webhookEvent: "worklog_created" });
    const hex = createHmac("sha256", secret).update(payload).digest("hex");
    expect(
      verifyJiraWebhookSignature(payload, `sha256=${hex}`, secret),
    ).toBe(true);
  });
});

describe("hashPayload", () => {
  it("returns a stable sha256 hex digest", () => {
    expect(hashPayload("abc")).toBe(hashPayload("abc"));
    expect(hashPayload("abc")).not.toBe(hashPayload("abd"));
    expect(hashPayload("abc")).toMatch(/^[a-f0-9]{64}$/);
  });
});
