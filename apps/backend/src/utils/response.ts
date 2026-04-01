import { Response } from 'express';

/**
 * Send a success JSON response.
 */
export function sendSuccess(res: Response, data: any, status = 200) {
  return res.status(status).json({ ok: true, data });
}

/**
 * Send a 400 bad request + error message.
 */
export function sendBadRequest(res: Response, error: string) {
  return res.status(400).json({ ok: false, error });
}

/**
 * Send a 401 unauthorized.
 */
export function sendUnauthorized(res: Response, error = 'Unauthorized') {
  return res.status(401).json({ ok: false, error });
}

/**
 * Send a 403 forbidden.
 */
export function sendForbidden(res: Response, error = 'Forbidden') {
  return res.status(403).json({ ok: false, error });
}

/**
 * Send a 404 not found.
 */
export function sendNotFound(res: Response, error = 'Not found') {
  return res.status(404).json({ ok: false, error });
}

/**
 * Send a 500 server error.
 */
export function sendServerError(res: Response, error: string) {
  return res.status(500).json({ ok: false, error });
}
