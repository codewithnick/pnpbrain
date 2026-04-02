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
import { asc, eq } from 'drizzle-orm';
import type { Agent, Business } from '@gcfis/db';
import type { GraphInput } from '@gcfis/agent/graph';
import type { StreamEvent } from '@gcfis/types';
import { sendBadRequest } from '../utils/response';
import {
  getAgentByApiKey,
  resolveAgentForBusiness,
} from '../lib/agents';
import {
  getBusinessById,
  isAllowedHostname,
  parseAllowedDomains,
  verifyPublicChatToken,
} from '../lib/business';
import {
  getEnabledSkillsForAgentScope,
  getMeetingIntegrationForAgentScope,
  getSupportIntegrationForAgentScope,
} from '../lib/businessSkills';
import { getEnabledCustomWebhookSkillsForAgentScope } from '../lib/customSkills';
import { isBusinessActive, recordMessageUsage } from '../lib/billing';
import { shouldEscalateResponse } from '../lib/escalation';
import { createSupportTicket } from '../lib/supportTickets';
import { createLeadHandoff } from '../lib/leadHandoffs';

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  threadId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  publicToken: z.string().min(1).optional(),
});

const EscalationRequestSchema = z.object({
  threadId: z.string().uuid(),
  customerMessage: z.string().min(1).max(4000),
  customerEmail: z.string().email().optional(),
  customerName: z.string().min(1).max(120).optional(),
  reason: z.string().min(1).max(200).optional(),
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

function previewValue(value: unknown, maxLength = 220): string {
  if (value === undefined || value === null) return '';
  try {
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    return raw.length > maxLength ? `${raw.slice(0, maxLength)}...` : raw;
  } catch {
    return typeof value === 'object' ? '[unserializable object]' : `${value}`;
  }
}

async function resolveScopedBusiness(
  conversationBusinessId: string | undefined,
  conversationAgentId: string | undefined,
  apiKey: string | undefined,
  publicToken: string | undefined,
  requestedAgentId: string | undefined,
): Promise<{ business: Business; agent: Agent; apiKeyMatched: boolean } | null> {
  let business: Business | null = null;
  let agent: Agent | null = null;
  let apiKeyMatched = false;

  if (apiKey) {
    agent = await getAgentByApiKey(apiKey);
    if (agent) {
      business = await getBusinessById(agent.businessId);
      apiKeyMatched = true;
    }
  }

  if (!business && publicToken) {
    const tokenPayload = verifyPublicChatToken(publicToken);
    if (tokenPayload) {
      if (requestedAgentId && requestedAgentId !== tokenPayload.agentId) {
        return null;
      }

      if (conversationAgentId && conversationAgentId !== tokenPayload.agentId) {
        return null;
      }

      business = await getBusinessById(tokenPayload.businessId);
      agent = await resolveAgentForBusiness(tokenPayload.businessId, tokenPayload.agentId);
      if (!agent || agent.id !== tokenPayload.agentId) {
        return null;
      }
    }
  }

  if (!business && conversationBusinessId) {
    business = await getBusinessById(conversationBusinessId);
  }

  if (!business) {
    return null;
  }

  if (conversationBusinessId && business.id !== conversationBusinessId) {
    return null;
  }

  if (!agent) {
    agent = await resolveAgentForBusiness(
      business.id,
      requestedAgentId ?? conversationAgentId ?? undefined,
    );
  }

  if (!agent || agent.businessId !== business.id) {
    return null;
  }

  if (conversationAgentId && agent.id !== conversationAgentId) {
    return null;
  }

  return { business, agent, apiKeyMatched };
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
      agentId: requestedAgentId,
      publicToken,
    } = parsed.data;

    const db = getDb();
    const existingConversation = incomingThreadId
      ? await db
          .select({
            id: conversations.id,
            businessId: conversations.businessId,
            agentId: conversations.agentId,
          })
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
    const runtime = await resolveScopedBusiness(
      existingConversation?.businessId,
      existingConversation?.agentId ?? undefined,
      apiKey,
      publicToken,
      requestedAgentId,
    );
    if (!runtime) {
      return sendBadRequest(
        res,
        existingConversation
          ? 'Conversation scope is invalid for this agent'
          : 'publicToken or a valid agent API key is required when the backend cannot infer business scope. If no default agent exists, pass agentId explicitly.'
      );
    }
    const { business, agent, apiKeyMatched } = runtime;

    // Billing gate
    if (!isBusinessActive(business)) {
      return res.status(402).json({
        ok: false,
        error: 'This business has no remaining credits. Top up credits to continue using PNpbrain.',
        code: 'INSUFFICIENT_CREDITS',
      });
    }

    const allowedDomains = parseAllowedDomains(agent.allowedDomains);
    const hasMatchingApiKey = apiKeyMatched;
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
      if (existingConversation.agentId && existingConversation.agentId !== agent.id) {
        return sendBadRequest(res, 'Thread does not belong to this agent');
      }
      conversationId = existingConversation.id;
    } else {
      const sessionId = crypto.randomUUID();
      const [newConversation] = await db
        .insert(conversations)
        .values({ businessId: business.id, agentId: agent.id, sessionId })
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

      const [enabledSkills, customSkills, meetingIntegration, supportIntegration] = await Promise.all([
        getEnabledSkillsForAgentScope({ businessId: business.id, agentId: agent.id }),
        getEnabledCustomWebhookSkillsForAgentScope({ businessId: business.id, agentId: agent.id }),
        getMeetingIntegrationForAgentScope({ businessId: business.id, agentId: agent.id }),
        getSupportIntegrationForAgentScope({ businessId: business.id, agentId: agent.id }),
      ]);

      const historyRows = await db
        .select({ role: messages.role, content: messages.content })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.createdAt));

      const conversationHistory = historyRows
        .filter((row): row is { role: 'user' | 'assistant' | 'system'; content: string } =>
          row.role === 'user' || row.role === 'assistant' || row.role === 'system'
        )
        .slice(-21);

      const normalizedHistory =
        conversationHistory.length > 0
        && conversationHistory[conversationHistory.length - 1]?.role === 'user'
        && conversationHistory[conversationHistory.length - 1]?.content === message
          ? conversationHistory.slice(0, -1)
          : conversationHistory;

      const graphInput: GraphInput = {
        businessId: business.id,
        agentId: agent.id,
        conversationId,
        botName: agent.botName,
        businessName: business.name,
        allowedDomains,
        userMessage: message,
        conversationHistory: normalizedHistory.slice(-20),
        enabledSkills,
        customSkills,
        meetingIntegration: meetingIntegration as unknown as Record<string, unknown>,
        supportIntegration: supportIntegration as unknown as Record<string, unknown>,
        createSupportTicket: async (payload: {
          reason: string;
          customerMessage: string;
          customerEmail?: string;
          customerName?: string;
        }) =>
          createSupportTicket({
            businessId: business.id,
            agentId: agent.id,
            conversationId,
            reason: payload.reason,
            customerMessage: payload.customerMessage,
            ...(payload.customerEmail ? { customerEmail: payload.customerEmail } : {}),
            ...(payload.customerName ? { customerName: payload.customerName } : {}),
            metadata: {
              source: 'agent_tool',
            },
          }),
        createLeadHandoff: async (payload: {
          reason: string;
          qualificationScore?: number;
          qualificationStage?: 'nurture' | 'mql' | 'sql';
          customerMessage: string;
          summary: string;
          customerEmail?: string;
          customerName?: string;
          companyName?: string;
        }) =>
          createLeadHandoff({
            businessId: business.id,
            agentId: agent.id,
            conversationId,
            reason: payload.reason,
            ...(payload.qualificationScore !== undefined
              ? { qualificationScore: payload.qualificationScore }
              : {}),
            ...(payload.qualificationStage !== undefined
              ? { qualificationStage: payload.qualificationStage }
              : {}),
            customerMessage: payload.customerMessage,
            summary: payload.summary,
            ...(payload.customerEmail ? { customerEmail: payload.customerEmail } : {}),
            ...(payload.customerName ? { customerName: payload.customerName } : {}),
            ...(payload.companyName ? { companyName: payload.companyName } : {}),
            metadata: {
              source: 'agent_tool',
            },
          }),
        llmProvider: agent.llmProvider,
        llmModel: agent.llmModel,
        ...(agent.llmApiKey ? { llmApiKey: agent.llmApiKey } : {}),
        ...(agent.llmBaseUrl ? { llmBaseUrl: agent.llmBaseUrl } : {}),
      };

      const graphStream = runGraph(graphInput);

      for await (const event of graphStream) {
        if (event.event === 'on_chain_start' && event.name) {
          emit({ type: 'step', step: event.name });
          emit({ type: 'thinking', stage: 'chain', message: `Running step: ${event.name}` });
        }

        if (event.event === 'on_tool_start') {
          const toolName = event.name ?? 'unknown_tool';
          emit({
            type: 'thinking',
            stage: 'tool_start',
            message: `Using tool: ${toolName}`,
            toolName,
            detail: previewValue(event.data?.input),
          });
        }

        if (event.event === 'on_tool_end') {
          const toolName = event.name ?? 'unknown_tool';
          emit({
            type: 'thinking',
            stage: 'tool_end',
            message: `Finished tool: ${toolName}`,
            toolName,
          });
          emit({
            type: 'reasoning',
            source: 'tool',
            summary: `${toolName} result: ${previewValue(event.data?.output)}`,
          });
        }

        if (event.event === 'on_tool_error') {
          const toolName = event.name ?? 'unknown_tool';
          const errorDetail =
            event.data && typeof event.data === 'object'
              ? (event.data as Record<string, unknown>)['error']
              : undefined;
          emit({
            type: 'thinking',
            stage: 'tool_error',
            message: `Tool failed: ${toolName}`,
            toolName,
            detail: previewValue(errorDetail),
          });
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
        .values({
          conversationId,
          role: 'assistant',
          content: fullAssistantResponse,
          metadata: {
            source: 'chatController',
            llmProvider: agent.llmProvider,
            llmModel: agent.llmModel,
          },
        })
        .returning();

      const shouldAutoEscalate =
        enabledSkills.includes('support_escalation') && shouldEscalateResponse(fullAssistantResponse);

      if (shouldAutoEscalate) {
        createSupportTicket({
          businessId: business.id,
          agentId: agent.id,
          conversationId,
          reason: 'agent_unable_to_answer',
          customerMessage: message,
          assistantMessage: fullAssistantResponse,
          metadata: {
            source: 'auto_escalation',
          },
        }).catch((err) => console.error('[support] auto escalation failed:', err));
      }

      // Background: extract + save memory (non-blocking)
      extractAndSaveMemory({
        businessId: business.id,
        agentId: agent.id,
        conversationId,
        userMessage: message,
        assistantResponse: fullAssistantResponse,
      }).catch((err) => console.error('[memory] extraction failed:', err));

      // Background: record billable usage (non-blocking)
      recordMessageUsage(business, agent.id).catch((err: unknown) =>
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

  public readonly handleManualEscalation = async (req: Request, res: Response) => {
    const parsed = EscalationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendBadRequest(res, parsed.error.issues.map((i) => i.message).join(', '));
    }

    const {
      threadId,
      customerMessage,
      customerEmail,
      customerName,
      reason,
      publicToken,
    } = parsed.data;

    const db = getDb();
    const existingConversation = await db
      .select({
        id: conversations.id,
        businessId: conversations.businessId,
        agentId: conversations.agentId,
      })
      .from(conversations)
      .where(eq(conversations.id, threadId))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!existingConversation) {
      return sendBadRequest(res, 'Thread not found');
    }

    const runtime = await resolveScopedBusiness(
      existingConversation.businessId,
      existingConversation.agentId ?? undefined,
      req.header('x-api-key'),
      publicToken,
      undefined,
    );

    if (!runtime) {
      return res.status(401).json({ ok: false, error: 'Unauthorized escalation request' });
    }
    const { business, agent } = runtime;

    const enabledSkills = await getEnabledSkillsForAgentScope({
      businessId: business.id,
      agentId: agent.id,
    });
    if (!enabledSkills.includes('support_escalation')) {
      return res.status(403).json({ ok: false, error: 'Support escalation skill is disabled' });
    }

    const ticket = await createSupportTicket({
      businessId: business.id,
      agentId: agent.id,
      conversationId: existingConversation.id,
      reason: reason ?? 'manual_customer_escalation',
      customerMessage,
      ...(customerEmail ? { customerEmail } : {}),
      ...(customerName ? { customerName } : {}),
      metadata: {
        source: 'manual_escalation_endpoint',
      },
    });

    return res.status(ticket.status === 'created' ? 201 : 502).json({
      ok: ticket.status === 'created',
      data: {
        status: ticket.status,
        provider: ticket.provider,
        externalTicketId: ticket.externalTicketId,
        externalTicketUrl: ticket.externalTicketUrl,
        message: ticket.message,
      },
      ...(ticket.status === 'failed' ? { error: ticket.message } : {}),
    });
  };
}
