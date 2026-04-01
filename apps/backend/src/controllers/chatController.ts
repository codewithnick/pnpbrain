/**
 * Controller for agent chat operations.
 * Coordinates request-level workflow for chat streaming.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { runGraph } from '@gcfis/agent/graph';
import { extractAndSaveMemory } from '@gcfis/agent/memory';
import { getDb } from '@gcfis/db/client';
import { conversations, messages } from '@gcfis/db/schema';
import { eq } from 'drizzle-orm';
import type { StreamEvent } from '@gcfis/types';
import { sendBadRequest } from '../utils/response';
import { getBusinessById, parseAllowedDomains } from '../lib/business';
import { isBusinessActive, recordMessageUsage } from '../lib/billing';

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  threadId: z.string().uuid().optional(),
  businessId: z.string().uuid(),
});

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) && v.every((x): x is string => typeof x === 'string') ? v : [];
  } catch {
    return [];
  }
}

export class ChatController {
  public readonly handleChatStream = async (req: Request, res: Response) => {
    // Parse + validate body
    let body: unknown;
    try {
      body = req.body;
    } catch {
      return sendBadRequest(res, 'Invalid JSON body');
    }

    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return sendBadRequest(res, parsed.error.issues.map((i) => i.message).join(', '));
    }

    const { message, threadId: incomingThreadId, businessId } = parsed.data;

    // Load business config
    const business = await getBusinessById(businessId);
    if (!business) {
      return sendBadRequest(res, 'Business not found');
    }

    // Billing gate
    if (!isBusinessActive(business)) {
      return res.status(402).json({
        ok: false,
        error: 'Free trial expired. Please subscribe to continue using GCFIS.',
        code: 'TRIAL_EXPIRED',
      });
    }

    const allowedDomains = parseAllowedDomains(business.allowedDomains);

    // Resolve or create conversation
    const db = getDb();
    let conversationId: string;

    if (incomingThreadId) {
      const [existing] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.id, incomingThreadId))
        .limit(1);

      if (!existing) return sendBadRequest(res, 'Thread not found');
      conversationId = existing.id;
    } else {
      const sessionId = crypto.randomUUID();
      const [newConversation] = await db
        .insert(conversations)
        .values({ businessId, sessionId })
        .returning({ id: conversations.id });
      conversationId = newConversation!.id;
    }

    // Save user message
    await db.insert(messages).values({
      conversationId,
      role: 'user',
      content: message,
    });

    // Stream SSE response
    let fullAssistantResponse = '';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', process.env['ALLOWED_ORIGINS'] ?? '*');

    const emit = (event: StreamEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      emit({ type: 'step', step: 'retrieving_context' });

      const graphInput = {
        businessId,
        conversationId,
        botName: business.botName,
        businessName: business.name,
        allowedDomains,
        userMessage: message,
        enabledSkills: parseJsonArray(business.enabledSkills),
        ...(business.llmProvider !== null ? { llmProvider: business.llmProvider } : {}),
        ...(business.llmModel !== null ? { llmModel: business.llmModel } : {}),
        ...(business.llmApiKey !== null ? { llmApiKey: business.llmApiKey } : {}),
        ...(business.llmBaseUrl !== null ? { llmBaseUrl: business.llmBaseUrl } : {}),
      };

      const graphStream = runGraph(graphInput);

      for await (const event of graphStream) {
        if (event.event === 'on_chain_start' && event.name) {
          emit({ type: 'step', step: event.name });
        }

        if (event.event === 'on_chat_model_stream') {
          const chunk = event.data?.chunk;
          if (chunk && typeof chunk === 'object' && 'content' in chunk) {
            const token = chunk.content as string;
            if (token) {
              fullAssistantResponse += token;
              emit({ type: 'token', token });
            }
          }
        }
      }

      // Save assistant message to DB
      const [savedMessage] = await db
        .insert(messages)
        .values({ conversationId, role: 'assistant', content: fullAssistantResponse })
        .returning();

      // Background: extract + save memory (non-blocking)
      extractAndSaveMemory({
        businessId,
        conversationId,
        userMessage: message,
        assistantResponse: fullAssistantResponse,
      }).catch((err) => console.error('[memory] extraction failed:', err));

      // Background: record billable usage (non-blocking)
      recordMessageUsage(business).catch((err) =>
        console.error('[billing] usage recording failed:', err)
      );

      emit({
        type: 'done',
        threadId: conversationId,
        message: {
          id: savedMessage!.id,
          role: 'assistant',
          content: fullAssistantResponse,
          createdAt: savedMessage!.createdAt.toISOString(),
        },
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      console.error('[chat] agent error:', error);
      emit({ type: 'error', error });
    } finally {
      res.end();
    }
  };
}
