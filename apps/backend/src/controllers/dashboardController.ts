import { Request, Response } from 'express';
import { count, eq } from 'drizzle-orm';
import { getDb } from '@gcfis/db/client';
import { conversations, firecrawlJobs, knowledgeDocuments, memoryFacts } from '@gcfis/db/schema';
import { requireBusinessAuth } from '../middleware/auth';

export class DashboardController {
  public readonly getStats = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'viewer');
    if (!auth) return;

    const db = getDb();
    const [conversationCount, knowledgeCount, memoryCount, crawlCount] = await Promise.all([
      db.select({ value: count() }).from(conversations).where(eq(conversations.businessId, auth.businessId)),
      db.select({ value: count() }).from(knowledgeDocuments).where(eq(knowledgeDocuments.businessId, auth.businessId)),
      db.select({ value: count() }).from(memoryFacts).where(eq(memoryFacts.businessId, auth.businessId)),
      db.select({ value: count() }).from(firecrawlJobs).where(eq(firecrawlJobs.businessId, auth.businessId)),
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
