import { Request, Response, NextFunction } from 'express';
import { getRequestId, logger } from '../lib/logger';

/**
 * Global error handler middleware.
 * Must be registered last.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = getRequestId(req, res);

  logger.error('request_failed', {
    requestId,
    method: req.method,
    path: req.originalUrl,
    err,
  });

  res.status(500).json({
    ok: false,
    error: process.env['NODE_ENV'] === 'production'
      ? 'Internal server error'
      : err.message,
    ...(requestId ? { requestId } : {}),
  });
}
