import { Request, Response } from 'express';
import { count, eq } from 'drizzle-orm';
import { getDb } from '@gcfis/db/client';
import { conversations, firecrawlJobs, knowledgeDocuments, memoryFacts } from '@gcfis/db/schema';
import { requireSupabaseAuth } from '../middleware/auth';
import { getBusinessByOwner } from '../lib/business';

export class DashboardController {
  public readonly getStats = async (req: Request, res: Response) => {
    const auth = await requireSupabaseAuth(req, res);
    if (!auth) return;

    const business = await getBusinessByOwner(auth.userId);
    if (!business) {
      return res.status(404).json({ ok: false, error: 'No business found. Complete onboarding first.' });
    }

    const db = getDb();
    const [conversationCount, knowledgeCount, memoryCount, crawlCount] = await Promise.all([
      db.select({ value: count() }).from(conversations).where(eq(conversations.businessId, business.id)),
      db.select({ value: count() }).from(knowledgeDocuments).where(eq(knowledgeDocuments.businessId, business.id)),
      db.select({ value: count() }).from(memoryFacts).where(eq(memoryFacts.businessId, business.id)),
      db.select({ value: count() }).from(firecrawlJobs).where(eq(firecrawlJobs.businessId, business.id)),
    ]);

    return res.json({
      ok: true,
      data: {
        conversations: conversationCount[0]?.value ?? 0,
        knowledgeDocuments: knowledgeCount[0]?.value ?? 0,
        memoryFacts: memoryCount[0]?.value ?? 0,
        crawlJobs: crawlCount[0]?.value ?? 0,
      },
    });
  };
}
