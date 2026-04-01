/**
 * POST /api/agent/chat
 *
 * Main chat endpoint — runs the LangGraph agent and streams SSE events.
 *
 * Request body (JSON):
 *   { message: string; threadId?: string; businessId: string }
 *
 * Response:
 *   text/event-stream  →  series of StreamEvent JSON objects
 *
 * StreamEvent shapes:
 *   { type: "step",  step: string }
 *   { type: "token", token: string }
 *   { type: "done",  threadId: string; message: ChatMessage }
 *   { type: "error", error: string }
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { runGraph } from '@gcfis/agent/graph';
import { getDb } from '@gcfis/db/client';
import { conversations, messages } from '@gcfis/db/schema';
import { eq } from 'drizzle-orm';
import { corsResponse, badRequest } from '@/lib/auth';
import { getBusinessById, parseAllowedDomains } from '@/lib/business';
import { isBusinessActive, recordMessageUsage } from '@/lib/billing';

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) && v.every((x): x is string => typeof x === 'string') ? v : [];
  } catch {
    return [];
  }
}

import { extractAndSaveMemory } from '@gcfis/agent/memory';
import type { StreamEvent } from '@gcfis/types';

export const runtime = 'nodejs'; // LangGraph requires Node.js runtime

// ─── Request schema ───────────────────────────────────────────────────────────

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  threadId: z.string().uuid().optional(),
  businessId: z.string().uuid(),
});

// ─── OPTIONS ──────────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return corsResponse();
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Parse + validate body ──────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const { message, threadId: incomingThreadId, businessId } = parsed.data;

  // ── Load business config ───────────────────────────────────────────────────
  const business = await getBusinessById(businessId);
  if (!business) {
    return badRequest('Business not found');
  }

  // ── Billing gate ───────────────────────────────────────────────────────────
  if (!isBusinessActive(business)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Free trial expired. Please subscribe to continue using GCFIS.',
        code: 'TRIAL_EXPIRED',
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const allowedDomains = parseAllowedDomains(business.allowedDomains);

  // ── Resolve or create conversation ────────────────────────────────────────
  const db = getDb();
  let conversationId: string;

  if (incomingThreadId) {
    // Verify it belongs to this business
    const [existing] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, incomingThreadId))
      .limit(1);

    if (!existing) return badRequest('Thread not found');
    conversationId = existing.id;
  } else {
    // New conversation
    const sessionId = crypto.randomUUID();
    const [newConversation] = await db
      .insert(conversations)
      .values({ businessId, sessionId })
      .returning({ id: conversations.id });
    conversationId = newConversation!.id;
  }

  // ── Save user message ─────────────────────────────────────────────────────
  await db.insert(messages).values({
    conversationId,
    role: 'user',
    content: message,
  });

  // ── Stream SSE response ───────────────────────────────────────────────────
  const encoder = new TextEncoder();
  let fullAssistantResponse = '';

  const stream = new ReadableStream({
    async start(controller) {
      /**
       * Emits a single SSE event with JSON payload.
       */
      function emit(event: StreamEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        emit({ type: 'step', step: 'retrieving_context' });

        const graphInput = {
          businessId,
          conversationId,
          botName: business.botName,
          businessName: business.name,
          allowedDomains,
          userMessage: message,
          // Enabled skills (parsed from JSON array string)
          enabledSkills: parseJsonArray(business.enabledSkills),
          ...(business.llmProvider !== null ? { llmProvider: business.llmProvider } : {}),
          ...(business.llmModel !== null ? { llmModel: business.llmModel } : {}),
          ...(business.llmApiKey !== null ? { llmApiKey: business.llmApiKey } : {}),
          ...(business.llmBaseUrl !== null ? { llmBaseUrl: business.llmBaseUrl } : {}),
        };

        const graphStream = runGraph(graphInput);

        for await (const event of graphStream) {
          // Emit step events for known node names
          if (event.event === 'on_chain_start' && event.name) {
            emit({ type: 'step', step: event.name });
          }

          // Stream token chunks
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

        // Background: extract + save memory facts (non-blocking)
        extractAndSaveMemory({
          businessId,
          conversationId,
          userMessage: message,
          assistantResponse: fullAssistantResponse,
        }).catch((err) => console.error('[memory] extraction failed:', err));

        // Background: record billable message usage (non-blocking)
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
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[chat] agent error:', error);
        emit({ type: 'error', error });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': process.env['ALLOWED_ORIGINS'] ?? '*',
    },
  });
}
