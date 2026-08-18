import { describe, expect, it } from "vitest";
import {
  formatGithubTokenExpiryLabel,
  githubExpiryReminderCopy,
  githubExpiryReminderWindow,
  githubTokenExpiryWarning,
  parseGithubAuthenticationTokenExpiration,
  utcDaysRemaining,
} from "@/lib/github-token-expiry";

describe("parseGithubAuthenticationTokenExpiration", () => {
  it("parses GitHub UTC header format", () => {
    const parsed = parseGithubAuthenticationTokenExpiration(
      "2021-11-06 19:06:32 UTC",
    );
    expect(parsed?.toISOString()).toBe("2021-11-06T19:06:32.000Z");
  });

  it("returns null for missing or empty headers", () => {
    expect(parseGithubAuthenticationTokenExpiration(null)).toBeNull();
    expect(parseGithubAuthenticationTokenExpiration("")).toBeNull();
  });

  it("parses ISO timestamps", () => {
    const parsed = parseGithubAuthenticationTokenExpiration(
      "2026-09-01T00:00:00.000Z",
    );
    expect(parsed?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("github expiry windows", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");

  it("classifies 14-day and 3-day windows", () => {
    expect(githubExpiryReminderWindow(14)).toBe("14d");
    expect(githubExpiryReminderWindow(4)).toBe("14d");
    expect(githubExpiryReminderWindow(3)).toBe("3d");
    expect(githubExpiryReminderWindow(1)).toBe("3d");
    expect(githubExpiryReminderWindow(15)).toBeNull();
    expect(githubExpiryReminderWindow(0)).toBeNull();
    expect(githubExpiryReminderWindow(-1)).toBeNull();
  });

  it("uses whole UTC days remaining", () => {
    expect(
      utcDaysRemaining(new Date("2026-08-29T12:00:00.000Z"), now),
    ).toBe(14);
    expect(
      utcDaysRemaining(new Date("2026-08-18T12:00:00.000Z"), now),
    ).toBe(3);
  });

  it("warns when expiring within 14 days or expired", () => {
    expect(
      githubTokenExpiryWarning("2026-08-29T12:00:00.000Z", now),
    ).toBe("expiring");
    expect(
      githubTokenExpiryWarning("2026-08-14T12:00:00.000Z", now),
    ).toBe("expired");
    expect(
      githubTokenExpiryWarning("2026-09-20T12:00:00.000Z", now),
    ).toBe("none");
    expect(githubTokenExpiryWarning(null, now)).toBe("none");
  });

  it("formats expiry labels", () => {
    expect(formatGithubTokenExpiryLabel(null, now)).toContain("Not reported");
    expect(
      formatGithubTokenExpiryLabel("2026-08-29T12:00:00.000Z", now),
    ).toContain("in 14 days");
  });

  it("builds reminder copy", () => {
    const copy = githubExpiryReminderCopy({
      window: "14d",
      daysRemaining: 14,
      expiresAt: new Date("2026-08-29T12:00:00.000Z"),
      settingsUrl: "https://example.com/settings",
    });
    expect(copy.subject).toContain("2 weeks");
    expect(copy.body).toContain("https://example.com/settings");
  });
});
