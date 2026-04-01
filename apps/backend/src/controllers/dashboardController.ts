import { Request, Response } from 'express';
import { and, count, eq } from 'drizzle-orm';
import { getDb } from '@gcfis/db/client';
import {
  conversations,
  firecrawlJobs,
  knowledgeDocuments,
  memoryFacts,
  messages,
  supportTickets,
} from '@gcfis/db/schema';
import { requireBusinessAuth } from '../middleware/auth';
import { getBusinessById } from '../lib/business';
import { getEnabledSkillsForAgentScope } from '../lib/businessSkills';

function scopedByAgent(
  agentId: string | undefined,
  businessExpr: ReturnType<typeof eq>,
  agentExpr: ReturnType<typeof eq>,
) {
  return agentId ? and(businessExpr, agentExpr) : businessExpr;
}

function scopedByAgentAndStatus(
  agentId: string | undefined,
  statusExpr: ReturnType<typeof eq>,
  businessExpr: ReturnType<typeof eq>,
  agentExpr: ReturnType<typeof eq>,
) {
  return agentId ? and(businessExpr, agentExpr, statusExpr) : and(businessExpr, statusExpr);
}

function scopedMessageRole(
  businessId: string,
  agentId: string | undefined,
  role: 'user' | 'assistant',
) {
  const base = and(eq(conversations.businessId, businessId), eq(messages.role, role));
  return agentId ? and(eq(conversations.businessId, businessId), eq(conversations.agentId, agentId), eq(messages.role, role)) : base;
}

export class DashboardController {
  public readonly getStats = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'viewer');
    if (!auth) return;

    const agentId = typeof req.query['agentId'] === 'string' ? req.query['agentId'] : undefined;
    const conversationWhere = agentId
      ? and(eq(conversations.businessId, auth.businessId), eq(conversations.agentId, agentId))
      : eq(conversations.businessId, auth.businessId);
    const knowledgeWhere = agentId
      ? and(eq(knowledgeDocuments.businessId, auth.businessId), eq(knowledgeDocuments.agentId, agentId))
      : eq(knowledgeDocuments.businessId, auth.businessId);
    const memoryWhere = agentId
      ? and(eq(memoryFacts.businessId, auth.businessId), eq(memoryFacts.agentId, agentId))
      : eq(memoryFacts.businessId, auth.businessId);
    const crawlWhere = agentId
      ? and(eq(firecrawlJobs.businessId, auth.businessId), eq(firecrawlJobs.agentId, agentId))
      : eq(firecrawlJobs.businessId, auth.businessId);

    const db = getDb();
    const [conversationCount, knowledgeCount, memoryCount, crawlCount] = await Promise.all([
      db.select({ value: count() }).from(conversations).where(conversationWhere),
      db.select({ value: count() }).from(knowledgeDocuments).where(knowledgeWhere),
      db.select({ value: count() }).from(memoryFacts).where(memoryWhere),
      db.select({ value: count() }).from(firecrawlJobs).where(crawlWhere),
    ]);

    return res.json({
      ok: true,
      data: {
        scope: {
          businessId: auth.businessId,
          ...(agentId ? { agentId } : {}),
        },
        conversations: conversationCount[0]?.value ?? 0,
        knowledgeDocuments: knowledgeCount[0]?.value ?? 0,
        memoryFacts: memoryCount[0]?.value ?? 0,
        crawlJobs: crawlCount[0]?.value ?? 0,
      },
    });
  };

  public readonly getUsage = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'viewer');
    if (!auth) return;

    const business = await getBusinessById(auth.businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Business not found' });

    const agentId = typeof req.query['agentId'] === 'string' ? req.query['agentId'] : undefined;
    const conversationsWhere = scopedByAgent(
      agentId,
      eq(conversations.businessId, auth.businessId),
      eq(conversations.agentId, agentId ?? ''),
    );
    const knowledgeWhere = scopedByAgent(
      agentId,
      eq(knowledgeDocuments.businessId, auth.businessId),
      eq(knowledgeDocuments.agentId, agentId ?? ''),
    );
    const memoryWhere = scopedByAgent(
      agentId,
      eq(memoryFacts.businessId, auth.businessId),
      eq(memoryFacts.agentId, agentId ?? ''),
    );
    const firecrawlWhere = scopedByAgent(
      agentId,
      eq(firecrawlJobs.businessId, auth.businessId),
      eq(firecrawlJobs.agentId, agentId ?? ''),
    );
    const firecrawlDoneWhere = scopedByAgentAndStatus(
      agentId,
      eq(firecrawlJobs.status, 'done'),
      eq(firecrawlJobs.businessId, auth.businessId),
      eq(firecrawlJobs.agentId, agentId ?? ''),
    );
    const firecrawlErrorWhere = scopedByAgentAndStatus(
      agentId,
      eq(firecrawlJobs.status, 'error'),
      eq(firecrawlJobs.businessId, auth.businessId),
      eq(firecrawlJobs.agentId, agentId ?? ''),
    );
    const supportWhere = scopedByAgent(
      agentId,
      eq(supportTickets.businessId, auth.businessId),
      eq(supportTickets.agentId, agentId ?? ''),
    );
    const supportSuccessWhere = scopedByAgentAndStatus(
      agentId,
      eq(supportTickets.status, 'created'),
      eq(supportTickets.businessId, auth.businessId),
      eq(supportTickets.agentId, agentId ?? ''),
    );

    const db = getDb();
    const [
      enabledSkills,
      conversationsCount,
      knowledgeCount,
      memoryCount,
      userMessagesCount,
      assistantMessagesCount,
      firecrawlTotalCount,
      firecrawlDoneCount,
      firecrawlErrorCount,
      supportTotalCount,
      supportSuccessCount,
    ] = await Promise.all([
      getEnabledSkillsForAgentScope({
        businessId: auth.businessId,
        ...(agentId ? { agentId } : {}),
      }),
      db.select({ value: count() }).from(conversations).where(conversationsWhere),
      db.select({ value: count() }).from(knowledgeDocuments).where(knowledgeWhere),
      db.select({ value: count() }).from(memoryFacts).where(memoryWhere),
      db
        .select({ value: count() })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(scopedMessageRole(auth.businessId, agentId, 'user')),
      db
        .select({ value: count() })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(scopedMessageRole(auth.businessId, agentId, 'assistant')),
      db.select({ value: count() }).from(firecrawlJobs).where(firecrawlWhere),
      db.select({ value: count() }).from(firecrawlJobs).where(firecrawlDoneWhere),
      db.select({ value: count() }).from(firecrawlJobs).where(firecrawlErrorWhere),
      db.select({ value: count() }).from(supportTickets).where(supportWhere),
      db.select({ value: count() }).from(supportTickets).where(supportSuccessWhere),
    ]);

    const usedCredits = business.creditsUsedTotal;
    const purchasedCredits = business.creditsPurchasedTotal;
    const currentBalance = business.creditBalance;
    const includedCredits = business.signupCreditsGranted + purchasedCredits;
    const remainingCredits = Math.max(0, currentBalance);
    const percentUsed =
      includedCredits === 0
        ? null
        : Math.min(100, Math.round((usedCredits / includedCredits) * 100));

    return res.json({
      ok: true,
      data: {
        credits: {
          used: usedCredits,
          balance: currentBalance,
          purchased: purchasedCredits,
          signupBonus: business.signupCreditsGranted,
          included: includedCredits,
          remaining: remainingCredits,
          percentUsed,
          unit: 'credit',
        },
        scope: {
          businessId: auth.businessId,
          ...(agentId ? { agentId } : {}),
        },
        totals: {
          conversations: conversationsCount[0]?.value ?? 0,
          knowledgeDocuments: knowledgeCount[0]?.value ?? 0,
          memoryFacts: memoryCount[0]?.value ?? 0,
          userMessages: userMessagesCount[0]?.value ?? 0,
          assistantMessages: assistantMessagesCount[0]?.value ?? 0,
        },
        skills: {
          enabled: enabledSkills,
          enabledCount: enabledSkills.length,
          trackedUsage: {
            firecrawl: {
              totalRuns: firecrawlTotalCount[0]?.value ?? 0,
              successfulRuns: firecrawlDoneCount[0]?.value ?? 0,
              failedRuns: firecrawlErrorCount[0]?.value ?? 0,
            },
            supportEscalation: {
              totalTickets: supportTotalCount[0]?.value ?? 0,
              successfulTickets: supportSuccessCount[0]?.value ?? 0,
              failedTickets: Math.max(
                0,
                (supportTotalCount[0]?.value ?? 0) - (supportSuccessCount[0]?.value ?? 0)
              ),
            },
          },
        },
      },
    });
  };
}
