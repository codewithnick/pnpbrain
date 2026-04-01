/**
 * GCFIS MCP Server
 *
 * Exposes the GCFIS agent, conversations, and knowledge base as MCP tools
 * so any MCP-compatible client (Claude Desktop, Cursor, Copilot, etc.) can
 * integrate with a business's AI assistant using its API key.
 *
 * Authentication: x-api-key header — the business's agentApiKey.
 *
 * Tools:
 *   chat                   — Send a message; get the agent's full reply
 *   list_conversations     — Recent conversation threads
 *   get_conversation       — All messages in a thread
 *   list_knowledge         — Knowledge base document index
 *   add_knowledge_url      — Crawl a URL and index it into the knowledge base
 *
 * Resources:
 *   business://config      — Agent settings and business metadata
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@gcfis/db/client';
import {
  conversations,
  firecrawlJobs,
  knowledgeDocuments,
  messages,
} from '@gcfis/db/schema';
import type { Business } from '@gcfis/db';
import { runGraph } from '@gcfis/agent/graph';
import { extractAndSaveMemory } from '@gcfis/agent/memory';
import { parseAllowedDomains } from '../lib/business';
import {
  getEnabledSkillsForBusiness,
  getMeetingIntegrationForBusiness,
  getSupportIntegrationForBusiness,
} from '../lib/businessSkills';
import { recordMessageUsage } from '../lib/billing';
import { enqueueCrawlJob } from '../jobs/crawlQueue';
import { createSupportTicket } from '../lib/supportTickets';

// ─── Helper ───────────────────────────────────────────────────────────────────

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createMcpServer(business: Business): McpServer {
  const server = new McpServer({
    name: 'gcfis-agent',
    version: '1.0.0',
  });

  const db = getDb();

  // ── Tool: chat ──────────────────────────────────────────────────────────────
  server.tool(
    'chat',
    'Send a message to the AI agent and receive its full response. Optionally continue an existing conversation with threadId.',
    {
      message: z.string().min(1).max(4000).describe('The message to send to the agent'),
      threadId: z
        .string()
        .uuid()
        .optional()
        .describe('Conversation thread ID to continue. Omit to start a new conversation.'),
    },
    async ({ message, threadId }) => {
      // Resolve or create conversation
      let conversationId: string;

      if (threadId) {
        const [existing] = await db
          .select({ id: conversations.id, businessId: conversations.businessId })
          .from(conversations)
          .where(eq(conversations.id, threadId))
          .limit(1);

        if (!existing) {
          return { content: [{ type: 'text', text: 'Error: thread not found.' }], isError: true };
        }

        if (existing.businessId !== business.id) {
          return {
            content: [{ type: 'text', text: 'Error: thread does not belong to this business.' }],
            isError: true,
          };
        }

        conversationId = existing.id;
      } else {
        const [newConversation] = await db
          .insert(conversations)
          .values({ businessId: business.id, sessionId: crypto.randomUUID() })
          .returning({ id: conversations.id });
        conversationId = newConversation!.id;
      }

      // Persist user message
      await db.insert(messages).values({ conversationId, role: 'user', content: message });

      // Run agent and collect full response
      const [enabledSkills, meetingIntegration, supportIntegration] = await Promise.all([
        getEnabledSkillsForBusiness(business.id),
        getMeetingIntegrationForBusiness(business.id),
        getSupportIntegrationForBusiness(business.id),
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

      const graphInput = {
        businessId: business.id,
        conversationId,
        botName: business.botName,
        businessName: business.name,
        allowedDomains: parseAllowedDomains(business.allowedDomains),
        userMessage: message,
        conversationHistory: normalizedHistory.slice(-20),
        enabledSkills,
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
            conversationId,
            reason: payload.reason,
            customerMessage: payload.customerMessage,
            ...(payload.customerEmail ? { customerEmail: payload.customerEmail } : {}),
            ...(payload.customerName ? { customerName: payload.customerName } : {}),
            metadata: {
              source: 'mcp_agent_tool',
            },
          }),
        ...(business.llmProvider !== null ? { llmProvider: business.llmProvider } : {}),
        ...(business.llmModel !== null ? { llmModel: business.llmModel } : {}),
        ...(business.llmApiKey !== null ? { llmApiKey: business.llmApiKey } : {}),
        ...(business.llmBaseUrl !== null ? { llmBaseUrl: business.llmBaseUrl } : {}),
      };

      let fullResponse = '';
      try {
        const graphStream = runGraph(graphInput);
        for await (const event of graphStream) {
          if (event.event === 'on_chat_model_stream') {
            const chunk = event.data?.chunk;
            if (chunk && typeof chunk === 'object' && 'content' in chunk) {
              const token = chunk.content as string;
              if (token) fullResponse += token;
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Agent error: ${msg}` }], isError: true };
      }

      // Persist assistant reply
      await db
        .insert(messages)
        .values({ conversationId, role: 'assistant', content: fullResponse });

      // Background: memory extraction
      extractAndSaveMemory({
        businessId: business.id,
        conversationId,
        userMessage: message,
        assistantResponse: fullResponse,
      }).catch((err) => console.error('[mcp/chat] memory extraction failed:', err));

      recordMessageUsage(business).catch((err: unknown) =>
        console.error('[mcp/chat] usage recording failed:', err)
      );

      return {
        content: [
          {
            type: 'text',
            text: fullResponse,
          },
        ],
        // Return threadId so the client can chain follow-up messages
        _meta: { threadId: conversationId },
      };
    }
  );

  // ── Tool: list_conversations ────────────────────────────────────────────────
  server.tool(
    'list_conversations',
    'List the most recent conversation threads for this business.',
    {
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(25)
        .describe('Maximum number of conversations to return (1–100)'),
    },
    async ({ limit }) => {
      const rows = await db
        .select({
          id: conversations.id,
          sessionId: conversations.sessionId,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .where(eq(conversations.businessId, business.id))
        .orderBy(desc(conversations.updatedAt))
        .limit(limit);

      if (rows.length === 0) {
        return { content: [{ type: 'text', text: 'No conversations found.' }] };
      }

      const ids = rows.map((r) => r.id);
      const lastMessages = await db
        .select({
          conversationId: messages.conversationId,
          content: messages.content,
          role: messages.role,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(inArray(messages.conversationId, ids))
        .orderBy(desc(messages.createdAt));

      const lastByConv = new Map<string, (typeof lastMessages)[number]>();
      for (const m of lastMessages) {
        if (!lastByConv.has(m.conversationId)) lastByConv.set(m.conversationId, m);
      }

      const data = rows.map((c) => {
        const last = lastByConv.get(c.id);
        return {
          id: c.id,
          sessionId: c.sessionId,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          preview: last ? last.content.slice(0, 160) : '(empty)',
          lastMessageRole: last?.role ?? null,
          lastMessageAt: last?.createdAt.toISOString() ?? c.updatedAt.toISOString(),
        };
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ── Tool: get_conversation ──────────────────────────────────────────────────
  server.tool(
    'get_conversation',
    'Get the full message history for a conversation thread.',
    {
      conversationId: z.string().uuid().describe('The conversation ID to fetch'),
    },
    async ({ conversationId }) => {
      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);

      if (!conv || conv.businessId !== business.id) {
        return {
          content: [{ type: 'text', text: 'Conversation not found.' }],
          isError: true,
        };
      }

      const msgs = await db
        .select({
          id: messages.id,
          role: messages.role,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.createdAt));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                id: conv.id,
                sessionId: conv.sessionId,
                createdAt: conv.createdAt.toISOString(),
                messages: msgs.map((m) => ({
                  id: m.id,
                  role: m.role,
                  content: m.content,
                  createdAt: m.createdAt.toISOString(),
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── Tool: list_knowledge ────────────────────────────────────────────────────
  server.tool(
    'list_knowledge',
    'List all knowledge base documents indexed for this business.',
    {},
    async () => {
      const docs = await db
        .select({
          id: knowledgeDocuments.id,
          title: knowledgeDocuments.title,
          sourceUrl: knowledgeDocuments.sourceUrl,
          contentType: knowledgeDocuments.contentType,
          sizeBytes: knowledgeDocuments.sizeBytes,
          createdAt: knowledgeDocuments.createdAt,
        })
        .from(knowledgeDocuments)
        .where(eq(knowledgeDocuments.businessId, business.id))
        .orderBy(desc(knowledgeDocuments.createdAt));

      if (docs.length === 0) {
        return { content: [{ type: 'text', text: 'No knowledge documents found.' }] };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(docs, null, 2) }],
      };
    }
  );

  // ── Tool: add_knowledge_url ─────────────────────────────────────────────────
  server.tool(
    'add_knowledge_url',
    'Crawl a URL and index its content into the knowledge base. Only URLs on allowed domains are accepted.',
    {
      url: z.string().url().describe('The URL to crawl and add to the knowledge base'),
    },
    async ({ url }) => {
      const allowedDomains = parseAllowedDomains(business.allowedDomains);

      if (allowedDomains.length > 0) {
        try {
          const hostname = new URL(url).hostname.toLowerCase();
          const allowed = allowedDomains.some(
            (d) => hostname === d || hostname.endsWith(`.${d}`)
          );
          if (!allowed) {
            return {
              content: [
                {
                  type: 'text',
                  text: `URL rejected: hostname "${hostname}" is not in your allowed domains list (${allowedDomains.join(', ')}). Add the domain in Settings → Profile.`,
                },
              ],
              isError: true,
            };
          }
        } catch {
          return { content: [{ type: 'text', text: 'Invalid URL.' }], isError: true };
        }
      }

      const [job] = await db
        .insert(firecrawlJobs)
        .values({
          businessId: business.id,
          urls: JSON.stringify([url]),
          status: 'queued',
        })
        .returning({ id: firecrawlJobs.id });

      const queued = await enqueueCrawlJob(job!.id);
      if (!queued) {
        return {
          content: [
            {
              type: 'text',
              text: 'Queue is unavailable. Ensure REDIS_URL is configured and crawl worker is running.',
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Crawl job queued (jobId: ${job!.id}). The URL will be scraped and indexed in the background. Check the Knowledge Base in admin to see when it's ready.`,
          },
        ],
      };
    }
  );

  // ── Resource: business config ───────────────────────────────────────────────
  server.resource(
    'business://config',
    'gcfis://business/config',
    { mimeType: 'application/json' },
    async () => {
      const config = {
        id: business.id,
        name: business.name,
        slug: business.slug,
        botName: business.botName,
        welcomeMessage: business.welcomeMessage,
        description: business.description,
        allowedDomains: parseAllowedDomains(business.allowedDomains),
        enabledSkills: await getEnabledSkillsForBusiness(business.id),
        llmProvider: business.llmProvider,
        llmModel: business.llmModel,
        widgetPosition: business.widgetPosition,
        widgetTheme: business.widgetTheme,
        primaryColor: business.primaryColor,
        showAvatar: business.showAvatar,
      };

      return {
        contents: [
          {
            uri: 'gcfis://business/config',
            mimeType: 'application/json',
            text: JSON.stringify(config, null, 2),
          },
        ],
      };
    }
  );

  return server;
}
