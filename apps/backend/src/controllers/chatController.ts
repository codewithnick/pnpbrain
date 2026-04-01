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
import type { Business } from '@gcfis/db';
import type { StreamEvent } from '@gcfis/types';
import { sendBadRequest } from '../utils/response';
import {
  getBusinessByApiKey,
  getBusinessById,
  isAllowedHostname,
  parseAllowedDomains,
  verifyPublicChatToken,
} from '../lib/business';
import {
  getEnabledSkillsForBusiness,
  getMeetingIntegrationForBusiness,
} from '../lib/businessSkills';
import { isBusinessActive, recordMessageUsage } from '../lib/billing';

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  threadId: z.string().uuid().optional(),
  publicToken: z.string().min(1).optional(),
});

function isAllowedOrigin(origin: string | undefined, allowedDomains: string[]): boolean {
  if (!origin) return false;
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return isAllowedHostname(hostname, allowedDomains);
  } catch {
    return false;
  }
}

async function resolveScopedBusiness(
  conversationBusinessId: string | undefined,
  apiKey: string | undefined,
  publicToken: string | undefined
): Promise<Business | null> {
  let business: Business | null;

  if (apiKey) {
    business = await getBusinessByApiKey(apiKey);
  } else if (publicToken) {
    const tokenPayload = verifyPublicChatToken(publicToken);
    business = tokenPayload ? await getBusinessById(tokenPayload.businessId) : null;
  } else if (conversationBusinessId) {
    business = await getBusinessById(conversationBusinessId);
  } else {
    business = null;
  }

  if (!business) {
    return null;
  }

  if (conversationBusinessId && business.id !== conversationBusinessId) {
    return null;
  }

  return business;
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

    const {
      message,
      threadId: incomingThreadId,
      publicToken,
    } = parsed.data;

    const db = getDb();
    const existingConversation = incomingThreadId
      ? await db
          .select({ id: conversations.id, businessId: conversations.businessId })
          .from(conversations)
          .where(eq(conversations.id, incomingThreadId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : null;

    if (incomingThreadId && !existingConversation) {
      return sendBadRequest(res, 'Thread not found');
    }

    // Load business config
    const apiKey = req.header('x-api-key');
    const business = await resolveScopedBusiness(
      existingConversation?.businessId,
      apiKey,
      publicToken
    );
    if (!business) {
      return sendBadRequest(
        res,
        existingConversation
          ? 'Business not found'
          : 'publicToken is required when the backend cannot infer business scope'
      );
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
    const hasMatchingApiKey = !!business.agentApiKey && apiKey === business.agentApiKey;
    const originAllowed = isAllowedOrigin(req.header('origin'), allowedDomains);

    if (allowedDomains.length > 0 && !originAllowed && !hasMatchingApiKey) {
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized. Use a configured hosted domain or provide a valid business API key.',
      });
    }

    // Resolve or create conversation
    let conversationId: string;

    if (existingConversation) {
      if (existingConversation.businessId !== business.id) {
        return sendBadRequest(res, 'Thread does not belong to this business');
      }
      conversationId = existingConversation.id;
    } else {
      const sessionId = crypto.randomUUID();
      const [newConversation] = await db
        .insert(conversations)
        .values({ businessId: business.id, sessionId })
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

      const [enabledSkills, meetingIntegration] = await Promise.all([
        getEnabledSkillsForBusiness(business.id),
        getMeetingIntegrationForBusiness(business.id),
      ]);

      const graphInput = {
        businessId: business.id,
        conversationId,
        botName: business.botName,
        businessName: business.name,
        allowedDomains,
        userMessage: message,
        enabledSkills,
        meetingIntegration: meetingIntegration as unknown as Record<string, unknown>,
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
        businessId: business.id,
        conversationId,
        userMessage: message,
        assistantResponse: fullAssistantResponse,
      }).catch((err) => console.error('[memory] extraction failed:', err));

      // Background: record billable usage (non-blocking)
      recordMessageUsage(business).catch((err: unknown) =>
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
