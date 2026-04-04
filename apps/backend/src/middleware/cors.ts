import { Request, Response, NextFunction } from 'express';

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

  if (configuredOrigins.length === 0) {
    return ['*'];
  }

  const inferredOrigins = [
    process.env['NEXT_PUBLIC_ADMIN_URL'],
    process.env['NEXT_PUBLIC_MARKETING_URL'],
    process.env['NEXT_PUBLIC_WIDGET_URL'],
  ].flatMap((value) => parseOrigins(value));

  return Array.from(new Set([...configuredOrigins, ...inferredOrigins]));
}

export function resolveAllowedCorsOrigin(origin: string | undefined): string | null {
  if (!origin) {
    return getAllowedCorsOrigins().includes('*') ? '*' : null;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  const allowedOrigins = getAllowedCorsOrigins();
  const allowLocalDev = process.env['NODE_ENV'] !== 'production' && isLocalDevOrigin(normalizedOrigin);

  if (allowLocalDev || allowedOrigins.includes('*') || allowedOrigins.includes(normalizedOrigin)) {
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
  const allowedOrigin = resolveAllowedCorsOrigin(originHeader);

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
