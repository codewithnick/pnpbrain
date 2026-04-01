import { Request, Response, NextFunction } from 'express';

/**
 * CORS middleware with custom origin handling.
 * Supports environment variable-based allowed origins.
 */
export function corsMwfn(req: Request, res: Response, next: NextFunction) {
  const allowedOrigins = process.env['ALLOWED_ORIGINS']
    ? process.env['ALLOWED_ORIGINS'].split(',').map(s => s.trim())
    : ['*'];

  const origin = req.headers.origin;
  
  if (allowedOrigins.includes('*') || !origin || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '3600');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
}
