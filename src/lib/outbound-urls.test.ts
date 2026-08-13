import { describe, expect, it } from "vitest";
import {
  isAllowedJiraBaseUrl,
  isAllowedSlackWebhookUrl,
  isBlockedOutboundHost,
  parsePublicHttpsUrl,
  safeHttpsOrigin,
} from "@/lib/outbound-urls";

describe("parsePublicHttpsUrl", () => {
  it("accepts a public https URL", () => {
    expect(parsePublicHttpsUrl("https://example.atlassian.net/")?.origin).toBe(
      "https://example.atlassian.net",
    );
  });

  it("rejects javascript, http, and credentialed URLs", () => {
    expect(parsePublicHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(parsePublicHttpsUrl("http://example.atlassian.net")).toBeNull();
    expect(
      parsePublicHttpsUrl("https://user:token@example.atlassian.net"),
    ).toBeNull();
  });

  it("rejects private and link-local hosts", () => {
    expect(parsePublicHttpsUrl("https://127.0.0.1")).toBeNull();
    expect(parsePublicHttpsUrl("https://10.0.0.1")).toBeNull();
    expect(parsePublicHttpsUrl("https://192.168.1.1")).toBeNull();
    expect(parsePublicHttpsUrl("https://169.254.169.254")).toBeNull();
    expect(parsePublicHttpsUrl("https://localhost")).toBeNull();
    expect(parsePublicHttpsUrl("https://[::1]")).toBeNull();
  });
});

describe("isBlockedOutboundHost", () => {
  it("allows public hostnames", () => {
    expect(isBlockedOutboundHost("example.atlassian.net")).toBe(false);
    expect(isBlockedOutboundHost("hooks.slack.com")).toBe(false);
  });
});

describe("isAllowedJiraBaseUrl", () => {
  it("allows Atlassian Cloud https origins", () => {
    expect(isAllowedJiraBaseUrl("https://acme.atlassian.net")).toBe(true);
    expect(isAllowedJiraBaseUrl("https://acme.atlassian.net/")).toBe(true);
  });

  it("rejects non-Atlassian hosts and API paths", () => {
    expect(isAllowedJiraBaseUrl("https://evil.example.com")).toBe(false);
    expect(
      isAllowedJiraBaseUrl("https://acme.atlassian.net/rest/api/3"),
    ).toBe(false);
    expect(isAllowedJiraBaseUrl("https://notatlassian.net")).toBe(false);
  });
});

describe("isAllowedSlackWebhookUrl", () => {
  it("allows hooks.slack.com https webhooks", () => {
    expect(
      isAllowedSlackWebhookUrl(
        "https://hooks.slack.com/services/T00/B00/xxx",
      ),
    ).toBe(true);
  });

  it("rejects other hosts", () => {
    expect(
      isAllowedSlackWebhookUrl("https://hooks.slack.com.evil.com/x"),
    ).toBe(false);
    expect(isAllowedSlackWebhookUrl("https://example.com/webhook")).toBe(false);
  });
});

describe("safeHttpsOrigin", () => {
  it("returns origin only", () => {
    expect(
      safeHttpsOrigin("https://acme.atlassian.net/wiki/foo"),
    ).toBe("https://acme.atlassian.net");
  });

  it("returns null for empty or unsafe values", () => {
    expect(safeHttpsOrigin(null)).toBeNull();
    expect(safeHttpsOrigin("javascript:alert(1)")).toBeNull();
  });
});
