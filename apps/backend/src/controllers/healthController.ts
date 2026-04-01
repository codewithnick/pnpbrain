/**
 * Health check endpoint.
 */

import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';

export class HealthController {
  public readonly handleHealth = async (_req: Request, res: Response) => {
    return sendSuccess(res, { status: 'ok' });
  };
}
