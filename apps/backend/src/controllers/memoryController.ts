import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';

export class MemoryController {
  public readonly getMemory = async (_req: Request, res: Response) => {
    return sendSuccess(res, { message: 'Memory endpoint' });
  };
}
