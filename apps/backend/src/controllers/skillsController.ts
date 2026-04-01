import { Request, Response } from 'express';
import { z } from 'zod';
import FirecrawlApp from '@mendable/firecrawl-js';
import { eq } from 'drizzle-orm';
import { getDb } from '@gcfis/db/client';
import { firecrawlJobs, knowledgeChunks, knowledgeDocuments } from '@gcfis/db/schema';
import { chunkText, getEmbeddingModel } from '@gcfis/agent/rag';
import { getBusinessById, getBusinessByOwner, parseAllowedDomains } from '../lib/business';
import { requireApiKey, requireSupabaseAuth } from '../middleware/auth';

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

    this.runFirecrawlJob(job!.id, business.id, safeUrls).catch((err) =>
      console.error('[firecrawl] job failed:', err)
    );

    return res.status(202).json({ ok: true, data: { jobId: job!.id, status: 'queued' } });
  };

  private async resolveBusinessForFirecrawl(
    req: Parameters<typeof requireSupabaseAuth>[0],
    res: Parameters<typeof requireSupabaseAuth>[1],
    businessId?: string
  ) {
    if (req.header('authorization')?.startsWith('Bearer ')) {
      const auth = await requireSupabaseAuth(req, res);
      if (!auth) return null;

      const business = await getBusinessByOwner(auth.userId);
      if (!business) {
        res.status(404).json({ ok: false, error: 'No business found. Complete onboarding first.' });
        return null;
      }

      return business;
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

  private async runFirecrawlJob(jobId: string, businessId: string, urls: string[]): Promise<void> {
    const db = getDb();
    await db.update(firecrawlJobs).set({ status: 'running', updatedAt: new Date() }).where(eq(firecrawlJobs.id, jobId));

    try {
      const apiKey = process.env['FIRECRAWL_API_KEY'];
      if (!apiKey) throw new Error('FIRECRAWL_API_KEY not set');

      const firecrawl = new FirecrawlApp({ apiKey });
      const embeddings = getEmbeddingModel();

      for (const url of urls) {
        const result = await firecrawl.scrapeUrl(url, { formats: ['markdown'] });
        if (!result.success || !result.markdown) continue;

        const title = result.metadata?.title ?? url;
        const [doc] = await db
          .insert(knowledgeDocuments)
          .values({ businessId, title, content: result.markdown, sourceUrl: url })
          .returning();

        const chunks = chunkText(result.markdown);
        const vectors = await embeddings.embedDocuments(chunks.map((c) => c.content));

        await db.insert(knowledgeChunks).values(
          chunks.map((chunk, i) => ({
            documentId: doc!.id,
            businessId,
            content: chunk.content,
            chunkIndex: chunk.index,
            embedding: vectors[i] ?? [],
          }))
        );
      }

      await db.update(firecrawlJobs).set({ status: 'done', updatedAt: new Date() }).where(eq(firecrawlJobs.id, jobId));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await db
        .update(firecrawlJobs)
        .set({ status: 'error', errorMessage, updatedAt: new Date() })
        .where(eq(firecrawlJobs.id, jobId));
      throw err;
    }
  }
}
