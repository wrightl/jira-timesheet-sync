const DAY_MS = 24 * 60 * 60 * 1000;

export type GithubExpiryReminderWindow = "14d" | "3d";

export type GithubTokenExpiryWarning = "none" | "expiring" | "expired";

/** Parse GitHub's `github-authentication-token-expiration` header. */
export function parseGithubAuthenticationTokenExpiration(
  header: string | null | undefined,
): Date | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;

  const utcMatch = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?: UTC)?$/i,
  );
  if (utcMatch) {
    const parsed = new Date(`${utcMatch[1]}T${utcMatch[2]}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Whole UTC days remaining until expiry (ceil). Negative when already expired. */
export function utcDaysRemaining(
  expiresAt: Date,
  now: Date = new Date(),
): number {
  return Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);
}

export function githubExpiryReminderWindow(
  daysRemaining: number,
): GithubExpiryReminderWindow | null {
  if (daysRemaining <= 0) return null;
  if (daysRemaining <= 3) return "3d";
  if (daysRemaining <= 14) return "14d";
  return null;
}

export function githubTokenExpiryWarning(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): GithubTokenExpiryWarning {
  if (!expiresAt) return "none";
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "none";
  const days = utcDaysRemaining(date, now);
  if (days <= 0) return "expired";
  if (days <= 14) return "expiring";
  return "none";
}

export function formatGithubTokenExpiryLabel(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (!expiresAt) {
    return "Not reported by GitHub (token may not expire)";
  }
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return "Not reported by GitHub (token may not expire)";
  }
  const days = utcDaysRemaining(date, now);
  const formatted = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  if (days <= 0) return `${formatted} (expired)`;
  if (days === 1) return `${formatted} (in 1 day)`;
  return `${formatted} (in ${days} days)`;
}

export function githubExpiryReminderCopy(input: {
  window: GithubExpiryReminderWindow;
  daysRemaining: number;
  expiresAt: Date;
  settingsUrl: string;
}): { subject: string; body: string } {
  const when =
    input.window === "14d" ? "in about 2 weeks" : "in about 3 days";
  const formatted = input.expiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const daysLabel =
    input.daysRemaining === 1 ? "1 day" : `${input.daysRemaining} days`;
  const subject = `GitHub token expires ${when} (${daysLabel} remaining)`;
  const body = [
    `Your GitHub personal access token expires on ${formatted} (${daysLabel} remaining).`,
    "",
    "Update it in Settings so the GitHub dashboard keeps working:",
    input.settingsUrl,
  ].join("\n");
  return { subject, body };
}

