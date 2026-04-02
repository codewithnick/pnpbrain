import { Request, Response } from 'express';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@gcfis/db/client';
import { conversations, messages } from '@gcfis/db/schema';
import { requireBusinessAuth } from '../middleware/auth';
import { resolveAgentForBusiness } from '../lib/agents';

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
    const messageRows = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(inArray(messages.conversationId, conversationIds))
      .orderBy(desc(messages.createdAt));

    const grouped = new Map<string, typeof messageRows>();
    for (const row of messageRows) {
      const rows = grouped.get(row.conversationId) ?? [];
      rows.push(row);
      grouped.set(row.conversationId, rows);
    }

    const data = conversationRows.map((conversation) => {
      const rows = grouped.get(conversation.id) ?? [];
      const lastMessage = rows[0];
      const orderedRows = [...rows].reverse();
      const firstMessage = orderedRows[0];
      const firstUserMessage = orderedRows.find((row) => row.role === 'user');
      const firstAssistantMessage = firstUserMessage
        ? orderedRows.find(
            (row) => row.role === 'assistant' && row.createdAt >= firstUserMessage.createdAt,
          )
        : orderedRows.find((row) => row.role === 'assistant');
      const assistantResponseMs =
        firstUserMessage && firstAssistantMessage
          ? Math.max(0, firstAssistantMessage.createdAt.getTime() - firstUserMessage.createdAt.getTime())
          : null;
      const conversationDurationMs =
        firstMessage && lastMessage
          ? Math.max(0, lastMessage.createdAt.getTime() - firstMessage.createdAt.getTime())
          : null;
      const userMessages = rows.filter((row) => row.role === 'user').length;
      const assistantMessages = rows.filter((row) => row.role === 'assistant').length;

      return {
        id: conversation.id,
        sessionId: conversation.sessionId,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        messageCount: rows.length,
        userMessageCount: userMessages,
        assistantMessageCount: assistantMessages,
        firstResponseMs: assistantResponseMs,
        conversationDurationMs,
        preview: lastMessage?.content.slice(0, 160) ?? '',
        lastMessageAt: lastMessage?.createdAt.toISOString() ?? conversation.updatedAt.toISOString(),
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
