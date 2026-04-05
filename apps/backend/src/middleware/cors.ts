import { Request, Response, NextFunction } from 'express';

function parseBooleanFlag(rawValue: string | undefined, fallbackValue: boolean): boolean {
  if (!rawValue) return fallbackValue;

  const normalized = rawValue.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;

  return fallbackValue;
}

function isPublicBrowserRoute(requestPath: string | undefined): boolean {
  if (!requestPath) return false;

  return requestPath === '/api/agent/chat' || requestPath.startsWith('/api/public/');
}

export function shouldEnforcePublicDomainRestrictions(): boolean {
  return parseBooleanFlag(process.env['ENFORCE_PUBLIC_DOMAIN_RESTRICTIONS'], false);
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

function parseOrigins(rawValue: string | undefined): string[] {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (value === '*' ? value : normalizeOrigin(value)));
}

export function getAllowedCorsOrigins(): string[] {
  const configuredOrigins = parseOrigins(process.env['ALLOWED_ORIGINS']);
  const inferredOrigins = [
    process.env['NEXT_PUBLIC_ADMIN_URL'] ?? 'https://admin.pnpbrain.com',
    process.env['NEXT_PUBLIC_MARKETING_URL'] ?? 'https://pnpbrain.com,https://www.pnpbrain.com',
    process.env['NEXT_PUBLIC_WIDGET_URL'] ?? 'https://cdn.pnpbrain.com',
  ].flatMap((value) => parseOrigins(value));

  if (configuredOrigins.includes('*')) {
    return ['*'];
  }

  const combinedOrigins = Array.from(new Set([...configuredOrigins, ...inferredOrigins]));

  if (combinedOrigins.length === 0) {
    return ['*'];
  }

  return combinedOrigins;
}

export function resolveAllowedCorsOrigin(origin: string | undefined, requestPath?: string): string | null {
  if (!origin) {
    return getAllowedCorsOrigins().includes('*') ? '*' : null;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  const allowAnyPublicOrigin = !shouldEnforcePublicDomainRestrictions() && isPublicBrowserRoute(requestPath);
  const allowedOrigins = getAllowedCorsOrigins();
  const allowLocalDev = process.env['NODE_ENV'] !== 'production' && isLocalDevOrigin(normalizedOrigin);

  if (allowAnyPublicOrigin || allowLocalDev || allowedOrigins.includes('*') || allowedOrigins.includes(normalizedOrigin)) {
    return normalizedOrigin;
  }

  return null;
}

/**
 * CORS middleware with custom origin handling.
 * Supports environment variable-based allowed origins.
 */
export function corsMwfn(req: Request, res: Response, next: NextFunction) {
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  const allowedOrigin = resolveAllowedCorsOrigin(originHeader, req.path);

  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Agent-Id, X-API-Key, X-Requested-With'
  );
  res.setHeader('Access-Control-Max-Age', '3600');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
}
