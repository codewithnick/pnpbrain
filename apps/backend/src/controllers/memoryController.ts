import { MemoryService } from '@gcfis/agent/memory';
import { Request, Response } from 'express';
import { requireBusinessAuth } from '../middleware/auth';
import { resolveAgentForBusiness } from '../lib/agents';
import {
  sendBadRequest,
  sendNotFound,
  sendServerError,
  sendSuccess,
} from '../utils/response';

export class MemoryController {
  private readonly memoryService = new MemoryService();

  public readonly getAgentMemory = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const requestedAgentId = typeof req.query['agentId'] === 'string' ? req.query['agentId'].trim() : '';
    let agentId: string | undefined;
    if (requestedAgentId) {
      const resolved = await resolveAgentForBusiness(auth.businessId, requestedAgentId);
      if (!resolved || resolved.id !== requestedAgentId) {
        return sendBadRequest(res, 'Invalid agentId for this business');
      }
      agentId = resolved.id;
    }

    const facts = await this.memoryService.listAgentMemoryFacts({
      businessId: auth.businessId,
      ...(agentId ? { agentId } : {}),
    });

    return sendSuccess(
      res,
      facts.map((fact) => ({
        ...fact,
        createdAt: fact.createdAt.toISOString(),
        updatedAt: fact.updatedAt.toISOString(),
      }))
    );
  };

  public readonly getMemory = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const conversationId = req.query['conversationId'];
    if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
      return sendBadRequest(res, 'conversationId query parameter is required');
    }

    const facts = await this.memoryService.listMemoryFacts({
      businessId: auth.businessId,
      conversationId,
    });

    return sendSuccess(
      res,
      facts.map((fact) => ({
        ...fact,
        createdAt: fact.createdAt.toISOString(),
      }))
    );
  };

  public readonly createMemory = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const conversationId = typeof req.body?.['conversationId'] === 'string' ? req.body['conversationId'] : '';
    const fact = typeof req.body?.['fact'] === 'string' ? req.body['fact'].trim() : '';

    if (!conversationId) {
      return sendBadRequest(res, 'conversationId is required');
    }

    if (!fact) {
      return sendBadRequest(res, 'fact is required');
    }

    try {
      const created = await this.memoryService.createMemoryFact({
        businessId: auth.businessId,
        conversationId,
        fact,
      });

      return sendSuccess(
        res,
        {
          ...created,
          createdAt: created.createdAt.toISOString(),
        },
        201
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'Conversation not found') {
        return sendNotFound(res, error.message);
      }

      return sendServerError(res, 'Failed to create memory fact');
    }
  };

  public readonly createAgentMemory = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const fact = typeof req.body?.['fact'] === 'string' ? req.body['fact'].trim() : '';
    const source =
      typeof req.body?.['source'] === 'string' && req.body['source'].trim().length > 0
        ? req.body['source'].trim()
        : 'manual';

    if (!fact) {
      return sendBadRequest(res, 'fact is required');
    }

    try {
      const created = await this.memoryService.createAgentMemoryFact({
        businessId: auth.businessId,
        fact,
        source,
      });

      return sendSuccess(
        res,
        {
          ...created,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
        201
      );
    } catch {
      return sendServerError(res, 'Failed to create agent memory fact');
    }
  };

  public readonly updateMemory = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const memoryFactId = req.params['id'];
    const fact = typeof req.body?.['fact'] === 'string' ? req.body['fact'].trim() : '';

    if (!memoryFactId) {
      return sendBadRequest(res, 'Memory fact ID is required');
    }

    if (!fact) {
      return sendBadRequest(res, 'fact is required');
    }

    const updated = await this.memoryService.updateMemoryFact({
      businessId: auth.businessId,
      memoryFactId,
      fact,
    });

    if (!updated) {
      return sendNotFound(res, 'Memory fact not found');
    }

    return sendSuccess(res, {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
    });
  };

  public readonly deleteMemory = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const memoryFactId = req.params['id'];
    if (!memoryFactId) {
      return sendBadRequest(res, 'Memory fact ID is required');
    }

    const deleted = await this.memoryService.deleteMemoryFact({
      businessId: auth.businessId,
      memoryFactId,
    });

    if (!deleted) {
      return sendNotFound(res, 'Memory fact not found');
    }

    return sendSuccess(res, { deleted: true });
  };

  public readonly updateAgentMemory = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const memoryFactId = req.params['id'];
    const fact = typeof req.body?.['fact'] === 'string' ? req.body['fact'].trim() : '';

    if (!memoryFactId) {
      return sendBadRequest(res, 'Memory fact ID is required');
    }

    if (!fact) {
      return sendBadRequest(res, 'fact is required');
    }

    const updated = await this.memoryService.updateAgentMemoryFact({
      businessId: auth.businessId,
      memoryFactId,
      fact,
    });

    if (!updated) {
      return sendNotFound(res, 'Agent memory fact not found');
    }

    return sendSuccess(res, {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  };

  public readonly deleteAgentMemory = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const memoryFactId = req.params['id'];
    if (!memoryFactId) {
      return sendBadRequest(res, 'Memory fact ID is required');
    }

    const deleted = await this.memoryService.deleteAgentMemoryFact({
      businessId: auth.businessId,
      memoryFactId,
    });

    if (!deleted) {
      return sendNotFound(res, 'Agent memory fact not found');
    }

    return sendSuccess(res, { deleted: true });
  };
}
