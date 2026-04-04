const PRODUCTION_BACKEND_ORIGIN = 'https://api.pnpbrain.com';
const LOCAL_BACKEND_ORIGIN = 'http://localhost:3011';

function normalizeBackendOrigin(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

function isDisallowedBackendOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === 'admin.pnpbrain.com'
      || hostname === 'pnpbrain.com'
      || hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

export function getDirectBackendBaseUrl(): string {
  const configuredOrigins = [
    process.env['BACKEND_INTERNAL_URL'],
    process.env['BACKEND_PUBLIC_URL'],
    process.env['NEXT_PUBLIC_BACKEND_URL'],
  ];

  for (const value of configuredOrigins) {
    const origin = normalizeBackendOrigin(value);
    if (origin && !isDisallowedBackendOrigin(origin)) {
      return origin;
    }
  }

  if (globalThis.window?.location.hostname.endsWith('pnpbrain.com')) {
    return PRODUCTION_BACKEND_ORIGIN;
  }

  return process.env['NODE_ENV'] === 'production'
    ? PRODUCTION_BACKEND_ORIGIN
    : LOCAL_BACKEND_ORIGIN;
}

export function getDirectBackendHost(): string {
  return new URL(getDirectBackendBaseUrl()).host;
}
