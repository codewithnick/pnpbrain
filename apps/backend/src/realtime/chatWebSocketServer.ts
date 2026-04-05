import type { IncomingMessage } from 'node:http';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import { runGraph } from '@pnpbrain/agent/graph';
import { extractAndSaveMemory } from '@pnpbrain/agent/memory';
import { getDb } from '@pnpbrain/db/client';
import { conversations, messages } from '@pnpbrain/db/schema';
import { desc, eq } from 'drizzle-orm';
import type { Agent, Business } from '@pnpbrain/db';
import type { GraphInput } from '@pnpbrain/agent/graph';
import type { StreamEvent } from '@pnpbrain/types';
import { getAgentByApiKey, resolveAgentForBusiness } from '../lib/agents';
import {
  getBusinessById,
  isAllowedHostname,
  parseAllowedDomains,
  verifyPublicChatToken,
} from '../lib/business';
import {
  getEnabledSkillsForAgentScope,
  getResolvedIntegrationsForAgentScope,
} from '../lib/businessSkills';
import { getEnabledCustomWebhookSkillsForAgentScope } from '../lib/customSkills';
import { isBusinessActive, recordMessageUsage, refreshBusinessUsageCycleIfNeeded } from '../lib/billing';
import { shouldEscalateResponse } from '../lib/escalation';
import { createSupportTicket } from '../lib/supportTickets';
import { createLeadHandoff } from '../lib/leadHandoffs';

const ChatSocketRequestSchema = z.object({
  type: z.literal('chat'),
  message: z.string().min(1).max(4000),
  threadId: z.string().uuid().optional(),
  publicToken: z.string().min(1).optional(),
  agentId: z.string().uuid().optional(),
});

type ChatSocketRequest = z.infer<typeof ChatSocketRequestSchema>;

interface InstallOptions {
  path: string;
}

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

  if (!business) return null;
  if (conversationBusinessId && business.id !== conversationBusinessId) return null;

  if (!agent) {
    agent = await resolveAgentForBusiness(
      business.id,
      requestedAgentId ?? conversationAgentId ?? undefined,
    );
  }

  if (!agent || agent.businessId !== business.id) return null;
  if (conversationAgentId && agent.id !== conversationAgentId) return null;

  return { business, agent, apiKeyMatched };
}

function emitWsEvent(wssClient: { send: (payload: string) => void; readyState: number; OPEN: number }, event: StreamEvent): void {
  if (wssClient.readyState !== wssClient.OPEN) return;
  wssClient.send(JSON.stringify(event));
}

async function processChatRequest(
  req: IncomingMessage,
  parsed: ChatSocketRequest,
  emit: (event: StreamEvent) => void,
): Promise<void> {
  const db = getDb();
  const existingConversation = parsed.threadId
    ? await db
        .select({
          id: conversations.id,
          businessId: conversations.businessId,
          agentId: conversations.agentId,
        })
        .from(conversations)
        .where(eq(conversations.id, parsed.threadId))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : null;

  if (parsed.threadId && !existingConversation) {
    emit({ type: 'error', error: 'Thread not found' });
    return;
  }

  const apiKeyHeader = req.headers['x-api-key'];
  const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
  const originHeader = req.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

  const runtime = await resolveScopedBusiness(
    existingConversation?.businessId,
    existingConversation?.agentId ?? undefined,
    apiKey,
    parsed.publicToken,
    parsed.agentId,
  );

  if (!runtime) {
    emit({
      type: 'error',
      error: existingConversation
        ? 'Conversation scope is invalid for this agent'
        : 'publicToken or a valid agent API key is required when the backend cannot infer business scope.',
    });
    return;
  }

  const { business: runtimeBusiness, agent, apiKeyMatched } = runtime;
  const business = await refreshBusinessUsageCycleIfNeeded(runtimeBusiness);

  if (!isBusinessActive(business)) {
    emit({
      type: 'error',
      error: 'This business has reached its monthly plan usage limit. Upgrade or add a usage pack to continue.',
    });
    return;
  }

  const allowedDomains = parseAllowedDomains(agent.allowedDomains);
  if (allowedDomains.length > 0 && !isAllowedOrigin(origin, allowedDomains) && !apiKeyMatched) {
    emit({
      type: 'error',
      error: 'Unauthorized. Use a configured hosted domain or provide a valid business API key.',
    });
    return;
  }

  let conversationId: string;
  if (existingConversation) {
    if (existingConversation.businessId !== business.id) {
      emit({ type: 'error', error: 'Thread does not belong to this business' });
      return;
    }
    if (existingConversation.agentId && existingConversation.agentId !== agent.id) {
      emit({ type: 'error', error: 'Thread does not belong to this agent' });
      return;
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

  await db.insert(messages).values({
    conversationId,
    role: 'user',
    content: parsed.message,
  });

  emit({ type: 'step', step: 'retrieving_context' });

  const [enabledSkills, customSkills, resolvedIntegrations] = await Promise.all([
    getEnabledSkillsForAgentScope({ businessId: business.id, agentId: agent.id }),
    getEnabledCustomWebhookSkillsForAgentScope({ businessId: business.id, agentId: agent.id }),
    getResolvedIntegrationsForAgentScope({ businessId: business.id, agentId: agent.id }),
  ]);

  const { meetingIntegration, supportIntegration } = resolvedIntegrations;

  const historyRows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(21);

  const conversationHistory = [...historyRows]
    .reverse()
    .filter((row): row is { role: 'user' | 'assistant' | 'system'; content: string } =>
      row.role === 'user' || row.role === 'assistant' || row.role === 'system'
    );

  const lastMessage = conversationHistory.at(-1);
  const normalizedHistory =
    lastMessage?.role === 'user' && lastMessage.content === parsed.message
      ? conversationHistory.slice(0, -1)
      : conversationHistory;

  const graphInput: GraphInput = {
    businessId: business.id,
    agentId: agent.id,
    conversationId,
    botName: agent.botName,
    businessName: business.name,
    allowedDomains,
    userMessage: parsed.message,
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
        metadata: { source: 'agent_tool' },
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
        metadata: { source: 'agent_tool' },
      }),
    llmProvider: agent.llmProvider,
    llmModel: agent.llmModel,
    ...(agent.llmApiKey ? { llmApiKey: agent.llmApiKey } : {}),
    ...(agent.llmBaseUrl ? { llmBaseUrl: agent.llmBaseUrl } : {}),
  };

  let fullAssistantResponse = '';

  try {
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

    const [savedMessage] = await db
      .insert(messages)
      .values({
        conversationId,
        role: 'assistant',
        content: fullAssistantResponse,
        metadata: {
          source: 'chatWebSocketServer',
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
        customerMessage: parsed.message,
        assistantMessage: fullAssistantResponse,
        metadata: { source: 'auto_escalation' },
      }).catch((err) => console.error('[support] auto escalation failed:', err));
    }

    extractAndSaveMemory({
      businessId: business.id,
      agentId: agent.id,
      conversationId,
      userMessage: parsed.message,
      assistantResponse: fullAssistantResponse,
    }).catch((err) => console.error('[memory] extraction failed:', err));

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
    console.error('[chat/ws] agent error:', {
      error,
      provider: agent.llmProvider,
      model: agent.llmModel,
      baseUrl: agent.llmBaseUrl ?? null,
      hasApiKey: Boolean(agent.llmApiKey),
      stack: err instanceof Error ? err.stack : undefined,
      cause:
        err && typeof err === 'object' && 'cause' in err
          ? previewValue((err as { cause?: unknown }).cause)
          : undefined,
    });
    emit({ type: 'error', error });
  }
}

export function createChatWebSocketServer(options: InstallOptions): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws, req) => {
    let inFlight = false;
    emitWsEvent(ws, { type: 'step', step: 'ws_connected' });

    ws.on('message', async (raw) => {
      if (inFlight) {
        emitWsEvent(ws, {
          type: 'error',
          error: 'A chat request is already in progress on this connection.',
        });
        return;
      }

      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(String(raw));
      } catch {
        emitWsEvent(ws, { type: 'error', error: 'Invalid JSON payload.' });
        return;
      }

      const validated = ChatSocketRequestSchema.safeParse(parsedPayload);
      if (!validated.success) {
        emitWsEvent(ws, {
          type: 'error',
          error: validated.error.issues.map((issue) => issue.message).join(', '),
        });
        return;
      }

      inFlight = true;
      const emit = (event: StreamEvent) => emitWsEvent(ws, event);

      try {
        await processChatRequest(req, validated.data, emit);
      } finally {
        inFlight = false;
      }
    });
  });

  wss.shouldHandle = (req: IncomingMessage): boolean => {
    const url = req.url ?? '';
    return url.startsWith(options.path);
  };

  return wss;
}
