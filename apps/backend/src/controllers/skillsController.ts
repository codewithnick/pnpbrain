import { Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '@pnpbrain/db/client';
import { firecrawlJobs } from '@pnpbrain/db/schema';
import { getBusinessById } from '../lib/business';
import { resolveAgentForBusiness } from '../lib/agents';
import { requireApiKey, requireBusinessAuth } from '../middleware/auth';
import { enqueueCrawlJob } from '../jobs/crawlQueue';

const requestSchema = z.object({
  businessId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  urls: z.array(z.string().url()).min(1).max(20),
});

type FirecrawlScope = {
  businessId: string;
  agentId: string;
};

export class SkillsController {
  public readonly runFirecrawl = async (req: Request, res: Response) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const { businessId, agentId, urls } = parsed.data;
    const scope = await this.resolveScopeForFirecrawl(req, res, businessId, agentId);
    if (!scope) return;

    const db = getDb();
    const [job] = await db
      .insert(firecrawlJobs)
      .values({
        businessId: scope.businessId,
        agentId: scope.agentId,
        urls: JSON.stringify(urls),
        status: 'queued',
      })
      .returning();

    const queued = await enqueueCrawlJob(job!.id);
    if (!queued) {
      return res.status(503).json({
        ok: false,
        error: 'Queue is unavailable. Ensure REDIS_URL is configured and crawl worker is running.',
      });
    }

    return res.status(202).json({ ok: true, data: { jobId: job!.id, status: 'queued' } });
  };

  private async resolveScopeForFirecrawl(
    req: Parameters<typeof requireBusinessAuth>[0],
    res: Parameters<typeof requireBusinessAuth>[1],
    businessId?: string,
    payloadAgentId?: string,
  ): Promise<FirecrawlScope | null> {
    if (req.header('authorization')?.startsWith('Bearer ')) {
      const auth = await requireBusinessAuth(req, res, 'member');
      if (!auth) return null;

      const requestedAgentId =
        payloadAgentId
        ?? (typeof req.query['agentId'] === 'string' ? req.query['agentId'] : undefined)
        ?? (typeof req.header('x-agent-id') === 'string' ? req.header('x-agent-id') : undefined);

      if (!requestedAgentId) {
        res.status(400).json({ ok: false, error: 'agentId is required' });
        return null;
      }

      const agent = await resolveAgentForBusiness(auth.businessId, requestedAgentId);
      if (!agent) {
        res.status(404).json({ ok: false, error: 'Agent not found' });
        return null;
      }

      return {
        businessId: auth.businessId,
        agentId: agent.id,
      };
    }

    if (!requireApiKey(req, res)) return null;

    if (!businessId) {
      res.status(400).json({ ok: false, error: 'businessId is required' });
      return null;
    }

    const requestedAgentId =
      payloadAgentId
      ?? (typeof req.query['agentId'] === 'string' ? req.query['agentId'] : undefined)
      ?? (typeof req.header('x-agent-id') === 'string' ? req.header('x-agent-id') : undefined);

    if (!requestedAgentId) {
      res.status(400).json({ ok: false, error: 'agentId is required' });
      return null;
    }

    const business = await getBusinessById(businessId);
    if (!business) {
      res.status(400).json({ ok: false, error: 'Business not found' });
      return null;
    }

    const agent = await resolveAgentForBusiness(business.id, requestedAgentId);
    if (!agent) {
      res.status(404).json({ ok: false, error: 'Agent not found' });
      return null;
    }

    return {
      businessId: business.id,
      agentId: agent.id,
    };
  }
}
