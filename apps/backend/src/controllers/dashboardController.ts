import { Request, Response } from 'express';
import { and, count, eq, gte } from 'drizzle-orm';
import { getDb } from '@pnpbrain/db/client';
import {
  agents,
  businessCreditLedger,
  conversations,
  firecrawlJobs,
  knowledgeDocuments,
  memoryFacts,
  messages,
  supportTickets,
} from '@pnpbrain/db/schema';
import { requireBusinessAuth } from '../middleware/auth';
import { getBusinessById } from '../lib/business';
import { getEnabledSkillsForAgentScope } from '../lib/businessSkills';
import { getBillingStatus, refreshBusinessUsageCycleIfNeeded } from '../lib/billing';

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

type TrendBucket = {
  date: string;
  conversations: number;
  userMessages: number;
  assistantMessages: number;
  memoryFacts: number;
  crawlJobs: number;
  creditsUsed: number;
  firecrawlQueued: number;
  firecrawlRunning: number;
  firecrawlDone: number;
  firecrawlError: number;
  modelUsage: Record<string, number>;
};

type MessageMetadata = {
  llmProvider?: string;
  llmModel?: string;
};

type TrendRows = {
  conversationRows: Array<{ createdAt: Date }>;
  memoryRows: Array<{ createdAt: Date }>;
  crawlRows: Array<{ createdAt: Date; status: string }>;
  creditRows: Array<{ createdAt: Date; amount: number; metadata: unknown }>;
  messageRows: Array<{
    createdAt: Date;
    role: string;
    metadata: unknown;
    fallbackProvider: string | null;
    fallbackModel: string | null;
  }>;
};

function createTrendBuckets(startDate: Date, days: number): Map<string, TrendBucket> {
  const buckets = new Map<string, TrendBucket>();
  for (let i = 0; i < days; i += 1) {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + i);
    const key = current.toISOString().slice(0, 10);
    buckets.set(key, {
      date: key,
      conversations: 0,
      userMessages: 0,
      assistantMessages: 0,
      memoryFacts: 0,
      crawlJobs: 0,
        creditsUsed: 0,
        firecrawlQueued: 0,
        firecrawlRunning: 0,
        firecrawlDone: 0,
        firecrawlError: 0,
        modelUsage: {},
    });
  }
  return buckets;
}

function incrementTrendBucket(
  buckets: Map<string, TrendBucket>,
  timestamp: Date,
  metric: 'conversations' | 'memoryFacts' | 'crawlJobs',
) {
  const key = timestamp.toISOString().slice(0, 10);
  const bucket = buckets.get(key);
  if (bucket) {
    bucket[metric] += 1;
  }
}

function incrementMessageBucket(
  buckets: Map<string, TrendBucket>,
  timestamp: Date,
  role: string,
) {
  const key = timestamp.toISOString().slice(0, 10);
  const bucket = buckets.get(key);
  if (!bucket) return;
  if (role === 'user') bucket.userMessages += 1;
  if (role === 'assistant') bucket.assistantMessages += 1;
}

function incrementCreditBucket(
  buckets: Map<string, TrendBucket>,
  timestamp: Date,
  amount: number,
) {
  const key = timestamp.toISOString().slice(0, 10);
  const bucket = buckets.get(key);
  if (bucket) {
    bucket.creditsUsed += Math.abs(amount);
  }
}

function incrementFirecrawlBucket(
  buckets: Map<string, TrendBucket>,
  timestamp: Date,
  status: string,
) {
  const key = timestamp.toISOString().slice(0, 10);
  const bucket = buckets.get(key);
  if (!bucket) return;
  bucket.crawlJobs += 1;
  if (status === 'queued') bucket.firecrawlQueued += 1;
  if (status === 'running') bucket.firecrawlRunning += 1;
  if (status === 'done') bucket.firecrawlDone += 1;
  if (status === 'error') bucket.firecrawlError += 1;
}

function incrementModelUsageBucket(
  buckets: Map<string, TrendBucket>,
  timestamp: Date,
  metadata: unknown,
  fallbackProvider?: string | null,
  fallbackModel?: string | null,
) {
  const key = timestamp.toISOString().slice(0, 10);
  const bucket = buckets.get(key);
  if (!bucket) return;

  const modelMetadata = metadata && typeof metadata === 'object' ? (metadata as MessageMetadata) : {};
  const provider = modelMetadata.llmProvider?.trim() || fallbackProvider?.trim() || 'unknown';
  const model = modelMetadata.llmModel?.trim() || fallbackModel?.trim() || 'unknown';
  const modelKey = `${provider}/${model}`;

  bucket.modelUsage[modelKey] = (bucket.modelUsage[modelKey] ?? 0) + 1;
}

function applyTrendRows(buckets: Map<string, TrendBucket>, rows: TrendRows, agentId?: string) {
  for (const row of rows.conversationRows) incrementTrendBucket(buckets, row.createdAt, 'conversations');
  for (const row of rows.memoryRows) incrementTrendBucket(buckets, row.createdAt, 'memoryFacts');
  for (const row of rows.crawlRows) incrementFirecrawlBucket(buckets, row.createdAt, row.status);
  for (const row of rows.creditRows) {
    const rowMetadata = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {};
    if (agentId && rowMetadata['agentId'] !== agentId) continue;
    if (row.amount < 0) incrementCreditBucket(buckets, row.createdAt, row.amount);
  }
  for (const row of rows.messageRows) {
    incrementMessageBucket(buckets, row.createdAt, row.role);
    if (row.role === 'assistant') {
      incrementModelUsageBucket(
        buckets,
        row.createdAt,
        row.metadata,
        row.fallbackProvider,
        row.fallbackModel,
      );
    }
  }
}

async function loadTrendRows(
  agentId: string | undefined,
  authBusinessId: string,
  startDate: Date,
) {
  const conversationWhere = agentId
    ? and(
        eq(conversations.businessId, authBusinessId),
        eq(conversations.agentId, agentId),
        gte(conversations.createdAt, startDate),
      )
    : and(eq(conversations.businessId, authBusinessId), gte(conversations.createdAt, startDate));

  const memoryWhere = agentId
    ? and(
        eq(memoryFacts.businessId, authBusinessId),
        eq(memoryFacts.agentId, agentId),
        gte(memoryFacts.createdAt, startDate),
      )
    : and(eq(memoryFacts.businessId, authBusinessId), gte(memoryFacts.createdAt, startDate));

  const crawlWhere = agentId
    ? and(
        eq(firecrawlJobs.businessId, authBusinessId),
        eq(firecrawlJobs.agentId, agentId),
        gte(firecrawlJobs.createdAt, startDate),
      )
    : and(eq(firecrawlJobs.businessId, authBusinessId), gte(firecrawlJobs.createdAt, startDate));

  const messageWhere = agentId
    ? and(
        eq(conversations.businessId, authBusinessId),
        eq(conversations.agentId, agentId),
        gte(messages.createdAt, startDate),
      )
    : and(eq(conversations.businessId, authBusinessId), gte(messages.createdAt, startDate));

  const creditWhere = and(
    eq(businessCreditLedger.businessId, authBusinessId),
    gte(businessCreditLedger.createdAt, startDate),
  );

  const db = getDb();
  const [conversationRows, memoryRows, crawlRows, creditRows, messageRows] = await Promise.all([
    db.select({ createdAt: conversations.createdAt }).from(conversations).where(conversationWhere),
    db.select({ createdAt: memoryFacts.createdAt }).from(memoryFacts).where(memoryWhere),
    db.select({ createdAt: firecrawlJobs.createdAt, status: firecrawlJobs.status }).from(firecrawlJobs).where(crawlWhere),
    db.select({ createdAt: businessCreditLedger.createdAt, amount: businessCreditLedger.amount, metadata: businessCreditLedger.metadata }).from(businessCreditLedger).where(creditWhere),
    db
      .select({
        createdAt: messages.createdAt,
        role: messages.role,
        metadata: messages.metadata,
        fallbackProvider: agents.llmProvider,
        fallbackModel: agents.llmModel,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .leftJoin(agents, eq(conversations.agentId, agents.id))
      .where(messageWhere),
  ]);

  return { conversationRows, memoryRows, crawlRows, creditRows, messageRows } satisfies TrendRows;
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
    const refreshedBusiness = await refreshBusinessUsageCycleIfNeeded(business);
    const billingStatus = getBillingStatus(refreshedBusiness);

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

    const usedCredits = refreshedBusiness.creditsUsedTotal;
    const purchasedCredits = refreshedBusiness.creditsPurchasedTotal;
    const currentBalance = refreshedBusiness.creditBalance;
    const includedCredits = billingStatus.monthlyMessageLimit;
    const remainingCredits = billingStatus.monthlyMessageLimit === null ? null : Math.max(0, currentBalance);
    const percentUsed =
      includedCredits === null || includedCredits === 0
        ? null
        : Math.min(100, Math.round((usedCredits / includedCredits) * 100));

    return res.json({
      ok: true,
      data: {
        credits: {
          used: usedCredits,
          balance: currentBalance,
          purchased: purchasedCredits,
          signupBonus: refreshedBusiness.signupCreditsGranted,
          included: includedCredits,
          remaining: remainingCredits,
          percentUsed,
          unit: 'message',
          planTier: billingStatus.planTier,
          planLabel: billingStatus.planLabel,
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

  public readonly getTrends = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'viewer');
    if (!auth) return;

    const agentId = typeof req.query['agentId'] === 'string' ? req.query['agentId'] : undefined;
    const daysParam = Number(req.query['days'] ?? '14');
    const days = Number.isFinite(daysParam) ? Math.min(Math.max(Math.floor(daysParam), 7), 90) : 14;

    const now = new Date();
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (days - 1));
    const bucketMap = createTrendBuckets(startDate, days);

    const rows = await loadTrendRows(agentId, auth.businessId, startDate);
    applyTrendRows(bucketMap, rows, agentId);

    const points = Array.from(bucketMap.values());

    return res.json({
      ok: true,
      data: {
        scope: {
          businessId: auth.businessId,
          ...(agentId ? { agentId } : {}),
        },
        range: {
          days,
          startDate: startDate.toISOString(),
          endDate: now.toISOString(),
        },
        points,
      },
    });
  };
}
