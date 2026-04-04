import { Request, Response } from 'express';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@pnpbrain/db/client';
import { conversations, messages } from '@pnpbrain/db/schema';
import { requireBusinessAuth } from '../middleware/auth';
import { resolveAgentForBusiness } from '../lib/agents';

const toDateOrNull = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export class ConversationsController {
  public readonly list = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const limitParam = Number(req.query['limit'] ?? '25');
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 25;
    const requestedAgentId = typeof req.query['agentId'] === 'string' ? req.query['agentId'].trim() : '';

    let agentId: string | undefined;
    if (requestedAgentId) {
      const resolved = await resolveAgentForBusiness(auth.businessId, requestedAgentId);
      if (!resolved || resolved.id !== requestedAgentId) {
        return res.status(400).json({ ok: false, error: 'Invalid agentId for this business' });
      }
      agentId = resolved.id;
    }

    const db = getDb();
    const conversationRows = await db
      .select({
        id: conversations.id,
        sessionId: conversations.sessionId,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(
        agentId
          ? and(eq(conversations.businessId, auth.businessId), eq(conversations.agentId, agentId))
          : eq(conversations.businessId, auth.businessId)
      )
      .orderBy(desc(conversations.updatedAt))
      .limit(limit);

    if (conversationRows.length === 0) {
      return res.json({ ok: true, data: [] });
    }

    const conversationIds = conversationRows.map((row) => row.id);
    const conversationStatsRows = await db
      .select({
        conversationId: messages.conversationId,
        messageCount: sql<number>`count(*)::int`,
        userMessageCount: sql<number>`count(*) filter (where ${messages.role} = 'user')::int`,
        assistantMessageCount: sql<number>`count(*) filter (where ${messages.role} = 'assistant')::int`,
        firstMessageAt: sql<Date | null>`min(${messages.createdAt})`.mapWith(messages.createdAt),
        lastMessageAt: sql<Date | null>`max(${messages.createdAt})`.mapWith(messages.createdAt),
        firstUserMessageAt:
          sql<Date | null>`min(case when ${messages.role} = 'user' then ${messages.createdAt} end)`.mapWith(
            messages.createdAt,
          ),
        firstAssistantMessageAt:
          sql<Date | null>`min(case when ${messages.role} = 'assistant' then ${messages.createdAt} end)`.mapWith(
            messages.createdAt,
          ),
      })
      .from(messages)
      .where(inArray(messages.conversationId, conversationIds))
      .groupBy(messages.conversationId);

    const rankedMessageRows = db
      .select({
        conversationId: messages.conversationId,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
        rowNumber: sql<number>`row_number() over (partition by ${messages.conversationId} order by ${messages.createdAt} desc)`.as('rowNumber'),
      })
      .from(messages)
      .where(inArray(messages.conversationId, conversationIds))
      .as('ranked_message_rows');

    const latestMessageRows = await db
      .select({
        conversationId: rankedMessageRows.conversationId,
        role: rankedMessageRows.role,
        content: rankedMessageRows.content,
        createdAt: rankedMessageRows.createdAt,
      })
      .from(rankedMessageRows)
      .where(eq(rankedMessageRows.rowNumber, 1));

    const statsByConversationId = new Map(
      conversationStatsRows.map((row) => [row.conversationId, row] as const),
    );
    const latestMessageByConversationId = new Map(
      latestMessageRows.map((row) => [row.conversationId, row] as const),
    );

    const data = conversationRows.map((conversation) => {
      const stats = statsByConversationId.get(conversation.id);
      const lastMessage = latestMessageByConversationId.get(conversation.id);
      const firstUserMessageAt = toDateOrNull(stats?.firstUserMessageAt);
      const firstAssistantMessageAt = toDateOrNull(stats?.firstAssistantMessageAt);
      const firstMessageAt = toDateOrNull(stats?.firstMessageAt);
      const lastMessageAt = toDateOrNull(stats?.lastMessageAt);
      const latestMessageAt = toDateOrNull(lastMessage?.createdAt);
      const assistantResponseMs =
        firstUserMessageAt && firstAssistantMessageAt
          ? Math.max(0, firstAssistantMessageAt.getTime() - firstUserMessageAt.getTime())
          : null;
      const conversationDurationMs =
        firstMessageAt && lastMessageAt ? Math.max(0, lastMessageAt.getTime() - firstMessageAt.getTime()) : null;

      return {
        id: conversation.id,
        sessionId: conversation.sessionId,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        messageCount: stats?.messageCount ?? 0,
        userMessageCount: stats?.userMessageCount ?? 0,
        assistantMessageCount: stats?.assistantMessageCount ?? 0,
        firstResponseMs: assistantResponseMs,
        conversationDurationMs,
        preview: lastMessage?.content.slice(0, 160) ?? '',
        lastMessageAt: latestMessageAt?.toISOString() ?? conversation.updatedAt.toISOString(),
        lastMessageRole: lastMessage?.role ?? null,
      };
    });

    return res.json({ ok: true, data });
  };

  public readonly getById = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const id = req.params['id'];
    const requestedAgentId = typeof req.query['agentId'] === 'string' ? req.query['agentId'].trim() : '';
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Conversation ID is required' });
    }

    if (requestedAgentId) {
      const resolved = await resolveAgentForBusiness(auth.businessId, requestedAgentId);
      if (!resolved || resolved.id !== requestedAgentId) {
        return res.status(400).json({ ok: false, error: 'Invalid agentId for this business' });
      }
    }

    const db = getDb();
    const [conversation] = await db
      .select({
        id: conversations.id,
        businessId: conversations.businessId,
        agentId: conversations.agentId,
        sessionId: conversations.sessionId,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (!conversation || conversation?.businessId !== auth.businessId) {
      return res.status(404).json({ ok: false, error: 'Conversation not found' });
    }

    if (requestedAgentId && conversation.agentId !== requestedAgentId) {
      return res.status(404).json({ ok: false, error: 'Conversation not found' });
    }

    const messageRows = await db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        metadata: messages.metadata,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(asc(messages.createdAt));

    return res.json({
      ok: true,
      data: {
        ...conversation,
        messages: messageRows.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
          responseTimeMs:
            message.role === 'assistant'
            && message.metadata
            && typeof message.metadata === 'object'
              ? (message.metadata as Record<string, unknown>)['responseTimeMs'] ?? null
              : null,
        })),
      },
    });
  };
}
