import { Request, Response, NextFunction } from 'express';

/**
 * Global error handler middleware.
 * Must be registered last.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('[error]', err);
  
  res.status(500).json({
    ok: false,
    error: process.env['NODE_ENV'] === 'production' 
      ? 'Internal server error' 
      : err.message
  });
}
