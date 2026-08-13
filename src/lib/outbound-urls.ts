/**
 * Allowlists and SSRF/XSS guards for admin-configured outbound URLs.
 */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4Octets(host: string): number[] | null {
  const match = host.match(IPV4);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  if (octets.some((n) => n > 255)) return null;
  return octets;
}

function isBlockedIpv4(octets: number[]): boolean {
  const a = octets[0] ?? 0;
  const b = octets[1] ?? 0;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::" || h === "::1") return true;
  if (h.startsWith("fe80:") || h.startsWith("fc00:") || h.startsWith("fd00:")) {
    return true;
  }
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(h);
  if (mapped?.[1]) {
    const octets = ipv4Octets(mapped[1]);
    return octets ? isBlockedIpv4(octets) : false;
  }
  return false;
}

export function isBlockedOutboundHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  const octets = ipv4Octets(host);
  if (octets) return isBlockedIpv4(octets);
  if (host.includes(":")) return isBlockedIpv6(host);
  return false;
}

/**
 * Parse a public https URL. Rejects non-https schemes (including javascript:),
 * embedded credentials, and private / link-local / loopback hosts.
 */
export function parsePublicHttpsUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname) return null;
  if (isBlockedOutboundHost(url.hostname)) return null;
  return url;
}

export function safeHttpsOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  const url = parsePublicHttpsUrl(value);
  return url ? url.origin : null;
}

export function isAtlassianCloudHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "atlassian.net" || host.endsWith(".atlassian.net");
}

export function isAllowedJiraBaseUrl(value: string): boolean {
  const url = parsePublicHttpsUrl(value);
  if (!url) return false;
  if (/\/rest\/api\/\d+/i.test(url.pathname)) return false;
  return isAtlassianCloudHost(url.hostname);
}

export function isAllowedSlackWebhookUrl(value: string): boolean {
  const url = parsePublicHttpsUrl(value);
  if (!url) return false;
  return url.hostname.toLowerCase() === "hooks.slack.com";
}
