import { Request, Response, NextFunction } from 'express';

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * CORS middleware with custom origin handling.
 * Supports environment variable-based allowed origins.
 */
export function corsMwfn(req: Request, res: Response, next: NextFunction) {
  const allowedOrigins = process.env['ALLOWED_ORIGINS']
    ? process.env['ALLOWED_ORIGINS'].split(',').map(s => s.trim())
    : ['*'];

  const origin = req.headers.origin;

  const allowLocalDev = process.env['NODE_ENV'] !== 'production' && !!origin && isLocalDevOrigin(origin);

  if (allowedOrigins.includes('*') || !origin || allowedOrigins.includes(origin) || allowLocalDev) {
    res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
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
