/**
 * Shared URL safety helpers for web-facing tools.
 */

import { isIP } from 'node:net';

const PRIVATE_IPV4_BLOCKS = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
] as const;

function isPrivateIPv4(hostname: string): boolean {
  return PRIVATE_IPV4_BLOCKS.some((pattern) => pattern.test(hostname));
}

function isPrivateIPv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
  );
}

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  if (normalized === 'localhost') return true;

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isPrivateIPv4(normalized);
  if (ipVersion === 6) return isPrivateIPv6(normalized);

  return false;
}

export function isHostnameAllowedByDomains(hostname: string, allowedDomains: string[]): boolean {
  const normalizedHostname = hostname.toLowerCase();
  const normalizedAllowed = allowedDomains.map((domain) => domain.toLowerCase());

  return normalizedAllowed.some(
    (domain) => normalizedHostname === domain || normalizedHostname.endsWith(`.${domain}`)
  );
}

export function validateSafeAllowedUrl(url: string, allowedDomains: string[]): {
  ok: boolean;
  reason?: string;
  hostname?: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'Invalid URL provided.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only http:// and https:// URLs are supported.' };
  }

  if (isPrivateOrLocalHostname(parsed.hostname)) {
    return { ok: false, reason: `Hostname "${parsed.hostname}" is private/local and blocked.` };
  }

  if (!isHostnameAllowedByDomains(parsed.hostname, allowedDomains)) {
    return {
      ok: false,
      reason: `Domain "${parsed.hostname}" is not in the allowlist: ${allowedDomains.join(', ')}`,
      hostname: parsed.hostname,
    };
  }

  return { ok: true, hostname: parsed.hostname };
}