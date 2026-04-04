import type { NextRequest } from 'next/server';

const LOCAL_ADMIN_URL = 'http://localhost:3012';

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
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
  if (configured) {
    return configured;
  }

  if (typeof globalThis.window !== 'undefined' && globalThis.window.location.origin) {
    return normalizeBaseUrl(globalThis.window.location.origin);
  }

  return LOCAL_ADMIN_URL;
}

export function getRequestAdminUrl(request: Pick<NextRequest, 'headers' | 'url'>): string {
  const configured = getConfiguredAdminUrl();
  if (configured) {
    return configured;
  }

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwardedHost) {
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
    return `${forwardedProto}://${forwardedHost}`;
  }

  return normalizeBaseUrl(new URL(request.url).origin);
}

export function buildAdminUrl(path: string, request?: Pick<NextRequest, 'headers' | 'url'>): URL {
  const baseUrl = request ? getRequestAdminUrl(request) : getBrowserAdminUrl();
  return new URL(path, `${baseUrl}/`);
}
