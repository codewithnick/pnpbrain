import { Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '@gcfis/db/client';
import { firecrawlJobs } from '@gcfis/db/schema';
import { getBusinessById, parseAllowedDomains } from '../lib/business';
import { requireApiKey, requireBusinessAuth } from '../middleware/auth';
import { enqueueCrawlJob } from '../jobs/crawlQueue';

const requestSchema = z.object({
  businessId: z.string().uuid().optional(),
  urls: z.array(z.string().url()).min(1).max(20),
});

export class SkillsController {
  public readonly runFirecrawl = async (req: Request, res: Response) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const { businessId, urls } = parsed.data;
    const business = await this.resolveBusinessForFirecrawl(req, res, businessId);
    if (!business) return;

    const allowedDomains = parseAllowedDomains(business.allowedDomains);
    const safeUrls = urls.filter((url) => {
      try {
        const hostname = new URL(url).hostname;
        return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
      } catch {
        return false;
      }
    });

    if (safeUrls.length === 0) {
      return res.status(400).json({ ok: false, error: 'No URLs passed the domain allowlist check' });
    }

    const db = getDb();
    const [job] = await db
      .insert(firecrawlJobs)
      .values({ businessId: business.id, urls: JSON.stringify(safeUrls), status: 'queued' })
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

  private async resolveBusinessForFirecrawl(
    req: Parameters<typeof requireBusinessAuth>[0],
    res: Parameters<typeof requireBusinessAuth>[1],
    businessId?: string
  ) {
    if (req.header('authorization')?.startsWith('Bearer ')) {
      const auth = await requireBusinessAuth(req, res, 'member');
      if (!auth) return null;

      return getBusinessById(auth.businessId);
    }

    if (!requireApiKey(req, res)) return null;

    if (!businessId) {
      res.status(400).json({ ok: false, error: 'businessId is required' });
      return null;
    }

    const business = await getBusinessById(businessId);
    if (!business) {
      res.status(400).json({ ok: false, error: 'Business not found' });
      return null;
    }

    return business;
  }
}
