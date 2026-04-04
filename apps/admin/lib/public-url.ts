import type { NextRequest } from 'next/server';

const LOCAL_ADMIN_URL = 'http://localhost:3012';
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function isLoopbackUrl(value: string | null): boolean {
  if (!value) {
    return false;
  }

  try {
    return LOOPBACK_HOSTNAMES.has(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function shouldPreferRuntimeOrigin(configured: string | null, runtimeOrigin: string): boolean {
  if (!configured) {
    return true;
  }

  return isLoopbackUrl(configured) && !isLoopbackUrl(runtimeOrigin);
}

function getConfiguredAdminUrl(): string | null {
  const configured =
    process.env['NEXT_PUBLIC_ADMIN_URL']?.trim() ||
    process.env['NEXT_PUBLIC_SITE_URL']?.trim() ||
    process.env['SITE_URL']?.trim();

  return configured ? normalizeBaseUrl(configured) : null;
}

export function getBrowserAdminUrl(): string {
  const configured = getConfiguredAdminUrl();
  const browserOrigin = globalThis.window?.location.origin;

  if (browserOrigin) {
    const runtimeOrigin = normalizeBaseUrl(browserOrigin);
    if (shouldPreferRuntimeOrigin(configured, runtimeOrigin)) {
      return runtimeOrigin;
    }
  }

  if (configured) {
    return configured;
  }

  return LOCAL_ADMIN_URL;
}

export function getRequestAdminUrl(request: Pick<NextRequest, 'headers' | 'url'>): string {
  const configured = getConfiguredAdminUrl();

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwardedHost) {
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
    const forwardedOrigin = `${forwardedProto}://${forwardedHost}`;

    if (shouldPreferRuntimeOrigin(configured, forwardedOrigin)) {
      return forwardedOrigin;
    }
  }

  const requestOrigin = normalizeBaseUrl(new URL(request.url).origin);
  if (shouldPreferRuntimeOrigin(configured, requestOrigin)) {
    return requestOrigin;
  }

  if (configured) {
    return configured;
  }

  return requestOrigin;
}

export function buildAdminUrl(path: string, request?: Pick<NextRequest, 'headers' | 'url'>): URL {
  const baseUrl = request ? getRequestAdminUrl(request) : getBrowserAdminUrl();
  return new URL(path, `${baseUrl}/`);
}
