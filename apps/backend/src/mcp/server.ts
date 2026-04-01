/**
 * GCFIS MCP Server
 *
 * Exposes the GCFIS agent, conversations, and knowledge base as MCP tools
 * so any MCP-compatible client (Claude Desktop, Cursor, Copilot, etc.) can
 * integrate with a business's AI assistant using its API key.
 *
 * Authentication: x-api-key header — the agent's API key.
 *
 * Tools:
 *   chat                   — Send a message; get the agent's full reply
 *   get_business_config    — Current business + agent configuration
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
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@gcfis/db/client';
import {
  conversations,
  firecrawlJobs,
  knowledgeDocuments,
  messages,
  SKILL_NAMES,
} from '@gcfis/db/schema';
import type { Agent, Business } from '@gcfis/db';
import { runGraph } from '@gcfis/agent/graph';
import { extractAndSaveMemory } from '@gcfis/agent/memory';
import { parseAllowedDomains } from '../lib/business';
import {
  disconnectIntegrationForAgent,
  getAllIntegrationsForAgentScope,
  getEnabledSkillsForAgentScope,
  getMeetingIntegrationForAgentScope,
  getSupportIntegrationForAgentScope,
  setEnabledSkillsForAgent,
  upsertIntegrationForAgent,
} from '../lib/businessSkills';
import { getEnabledCustomWebhookSkillsForAgentScope } from '../lib/customSkills';
import { recordMessageUsage } from '../lib/billing';
import { enqueueCrawlJob } from '../jobs/crawlQueue';
import { processCrawlJob } from '../jobs/crawlRunner';
import { createSupportTicket } from '../lib/supportTickets';
import { createLeadHandoff } from '../lib/leadHandoffs';

// ─── Helper ───────────────────────────────────────────────────────────────────
function sanitizeAssistantReply(text: string): string {
  const filtered = text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;

      // Remove leaked internal tool-call traces from user-facing output.
      if (
        /^\{\s*"name"\s*:\s*"[a-zA-Z0-9_:-]+"\s*,\s*"parameters"\s*:\s*\{.*\}\s*\}$/.test(
          trimmed
        )
      ) {
        return false;
      }

      if (/^(tool_calls?|function_call)\b/i.test(trimmed)) {
        return false;
      }

      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return filtered;
}

function getCrawlErrorHint(errorMessage: string | null): string | null {
  if (!errorMessage) return null;

  const normalized = errorMessage.toLowerCase();

  if (normalized.includes('status code: 401') || normalized.includes('unauthorized')) {
    return 'Firecrawl authentication failed. Verify FIRECRAWL_API_KEY in the running crawl executor (worker or backend) and restart the process.';
  }

  if (normalized.includes('firecrawl_api_key not set')) {
    return 'FIRECRAWL_API_KEY is missing. Set it in your environment for whichever process executes crawl jobs.';
  }

  if (normalized.includes('no valid urls')) {
    return 'The crawl job payload had no valid URLs. Ensure URLs are absolute (https://...) before enqueueing.';
  }

  if (normalized.includes('fetch failed') || normalized.includes('econnrefused')) {
    return 'Network connectivity failed during crawling. Check outbound access and DNS from the worker environment.';
  }

  if (normalized.includes('expected 1536 dimensions')) {
    return 'Embedding model dimensions do not match database schema. Align embedding output size with knowledge_chunks.embedding vector(1536), or migrate schema/model together.';
  }

  if (normalized.includes('no crawlable pages found')) {
    return 'No crawlable content was discovered. Check robots.txt restrictions, content-type (HTML/text), domain policy allow/deny lists, and URL accessibility from the worker environment.';
  }

  return null;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createMcpServer(input: { business: Business; agent: Agent }): McpServer {
  const { business, agent } = input;
  const server = new McpServer({
    name: 'gcfis-agent',
    version: '1.0.0',
  });

  const db = getDb();
  const allowedSkillNames = [...SKILL_NAMES];
  const allowedDomains = parseAllowedDomains(agent.allowedDomains);
  const llmProvider = agent.llmProvider;
  const llmModel = agent.llmModel;
  const llmApiKey = agent.llmApiKey;
  const llmBaseUrl = agent.llmBaseUrl;

  const agentScopedConversationWhere = and(
    eq(conversations.businessId, business.id),
    eq(conversations.agentId, agent.id)
  );
  const agentScopedKnowledgeWhere = and(
    eq(knowledgeDocuments.businessId, business.id),
    eq(knowledgeDocuments.agentId, agent.id)
  );
  const agentScopedCrawlWhere = and(
    eq(firecrawlJobs.businessId, business.id),
    eq(firecrawlJobs.agentId, agent.id)
  );

  const dispatchCrawlJob = async (jobId: string, urls: string[]) => {
    const queued = await enqueueCrawlJob(jobId);
    if (queued) {
      return { mode: 'queue' as const };
    }

    if (!process.env['FIRECRAWL_API_KEY']) {
      return { mode: 'unavailable' as const };
    }

    // Redis queue is unavailable; run in background from API process.
    processCrawlJob(jobId, business.id, agent.id, urls).catch((err) =>
      console.error('[mcp/crawl] inline crawl failed:', err)
    );

    return { mode: 'inline' as const };
  };

  const buildBusinessConfig = async () => ({
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      description: business.description,
    },
    agent: {
      id: agent.id,
      name: agent.name,
      slug: agent.slug,
      description: agent.description,
      botName: agent.botName,
      welcomeMessage: agent.welcomeMessage,
      allowedDomains,
      enabledSkills: await getEnabledSkillsForAgentScope({ businessId: business.id, agentId: agent.id }),
      customSkills: await getEnabledCustomWebhookSkillsForAgentScope({ businessId: business.id, agentId: agent.id }),
      llmProvider,
      llmModel,
      widgetPosition: agent.widgetPosition,
      widgetTheme: agent.widgetTheme,
      primaryColor: agent.primaryColor,
      showAvatar: agent.showAvatar,
    },
  });

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
      try {
        // Resolve or create conversation
        let conversationId: string;
        console.log('[MCP/chat] START - message:', message.substring(0, 80) + '...');

        if (threadId) {
          console.log('[MCP/chat] Using existing thread:', threadId);
          const [existing] = await db
            .select({ id: conversations.id, businessId: conversations.businessId, agentId: conversations.agentId })
            .from(conversations)
            .where(eq(conversations.id, threadId))
            .limit(1);

          if (!existing) {
            console.log('[MCP/chat] ERROR - thread not found');
            return { content: [{ type: 'text', text: 'Error: thread not found.' }], isError: true };
          }

          if (existing.businessId !== business.id) {
            console.log('[MCP/chat] ERROR - thread business mismatch');
            return {
              content: [{ type: 'text', text: 'Error: thread does not belong to this business.' }],
              isError: true,
            };
          }

          if (existing.agentId && existing.agentId !== agent.id) {
            console.log('[MCP/chat] ERROR - thread agent mismatch');
            return {
              content: [{ type: 'text', text: 'Error: thread does not belong to this agent.' }],
              isError: true,
            };
          }

          conversationId = existing.id;
        } else {
          console.log('[MCP/chat] Creating new conversation');
          const [newConversation] = await db
            .insert(conversations)
            .values({ businessId: business.id, agentId: agent.id, sessionId: crypto.randomUUID() })
            .returning({ id: conversations.id });
          conversationId = newConversation!.id;
          console.log('[MCP/chat] New conversation created:', conversationId);
        }

        // Persist user message
        console.log('[MCP/chat] Persisting user message');
        await db.insert(messages).values({ conversationId, role: 'user', content: message });

        // Run agent and collect full response
        console.log('[MCP/chat] Fetching enabled skills and integrations');
        const [enabledSkills, customSkills, meetingIntegration, supportIntegration] = await Promise.all([
          getEnabledSkillsForAgentScope({ businessId: business.id, agentId: agent.id }),
          getEnabledCustomWebhookSkillsForAgentScope({ businessId: business.id, agentId: agent.id }),
          getMeetingIntegrationForAgentScope({ businessId: business.id, agentId: agent.id }),
          getSupportIntegrationForAgentScope({ businessId: business.id, agentId: agent.id }),
        ]);
        console.log('[MCP/chat] Enabled skills:', enabledSkills);

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
                source: 'mcp_agent_tool',
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
                source: 'mcp_agent_tool',
              },
            }),
          llmProvider,
          llmModel,
          ...(llmApiKey ? { llmApiKey } : {}),
          ...(llmBaseUrl ? { llmBaseUrl } : {}),
        };

        let fullResponse = '';
        console.log('[MCP/chat] 🚀 Running graph with input - skills:', enabledSkills);
        const graphStream = runGraph(graphInput);
        let eventCount = 0;
        for await (const event of graphStream) {
          eventCount++;
          console.log(`[MCP/chat] 📊 Event #${eventCount}: ${event.event}`);
          const eventData = (event.data ?? {}) as Record<string, unknown>;
          
          if (event.event === 'on_chat_model_stream') {
            const chunk = event.data?.chunk;
            if (chunk && typeof chunk === 'object' && 'content' in chunk) {
              const token = chunk.content as string;
              if (token) {
                fullResponse += token;
                console.log('[MCP/chat]   📝 Token:', token.substring(0, 50));
              }
            }
          }
          
          if (event.event === 'on_tool_start') {
            console.log('[MCP/chat] 🔧 TOOL STARTED:', eventData['tool'] ?? 'unknown');
            console.log('[MCP/chat]   Input:', JSON.stringify(eventData['input'] ?? {}).substring(0, 100));
          }
          
          if (event.event === 'on_tool_end') {
            console.log('[MCP/chat] ✅ TOOL FINISHED:', eventData['tool'] ?? 'unknown');
            console.log('[MCP/chat]   Output:', JSON.stringify(eventData['output'] ?? '').substring(0, 100));
          }
          
          if (event.event === 'on_tool_error') {
            console.log('[MCP/chat] ❌ TOOL ERROR:', eventData['tool'] ?? 'unknown');
            console.log('[MCP/chat]   Error:', eventData['error'] ?? 'unknown');
          }
        }
        console.log('[MCP/chat] ✅ Graph stream complete - events received:', eventCount);

        fullResponse = sanitizeAssistantReply(fullResponse);
        if (!fullResponse) {
          fullResponse =
            'I do not have enough verified company data for a specific answer yet. Could you share one more detail?';
        }

        // Persist assistant reply
        console.log('[MCP/chat] 💾 Persisting response (length:', fullResponse.length, ')');
        await db
          .insert(messages)
          .values({ conversationId, role: 'assistant', content: fullResponse });

        // Background: memory extraction
        console.log('[MCP/chat] 📚 Queuing memory extraction');
        extractAndSaveMemory({
          businessId: business.id,
          agentId: agent.id,
          conversationId,
          userMessage: message,
          assistantResponse: fullResponse,
        }).catch((err) => console.error('[MCP/chat] memory extraction failed:', err));

        recordMessageUsage(business).catch((err: unknown) =>
          console.error('[MCP/chat] usage recording failed:', err)
        );

        console.log('[MCP/chat] ✨ COMPLETE - returning response to client');
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
      } catch (err) {
        console.error('[MCP/chat] 💥 FATAL ERROR:', err);
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[MCP/chat] Error details:', msg);
        if (err instanceof Error) {
          console.error('[MCP/chat] Stack trace:', err.stack?.substring(0, 300));
        }
        return { content: [{ type: 'text', text: `Agent error: ${msg}` }], isError: true };
      }
    }
  );

  // ── Tool: list_conversations ────────────────────────────────────────────────
  server.tool(
    'get_business_config',
    'Return the current business and agent configuration for this API key.',
    {},
    async () => {
      const config = await buildBusinessConfig();

      return {
        content: [{ type: 'text', text: JSON.stringify(config, null, 2) }],
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
        .where(agentScopedConversationWhere)
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

      if (!conv || conv.businessId !== business.id || (conv.agentId && conv.agentId !== agent.id)) {
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
        .where(agentScopedKnowledgeWhere)
        .orderBy(desc(knowledgeDocuments.createdAt));

      if (docs.length === 0) {
        return { content: [{ type: 'text', text: 'No knowledge documents found.' }] };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(docs, null, 2) }],
      };
    }
  );

  // ── Tool: delete_knowledge_document ─────────────────────────────────────────
  server.tool(
    'delete_knowledge_document',
    'Delete a knowledge document by ID for this business.',
    {
      documentId: z.string().uuid().describe('Knowledge document ID to delete'),
    },
    async ({ documentId }) => {
      const [doc] = await db
        .select({ id: knowledgeDocuments.id })
        .from(knowledgeDocuments)
        .where(
          and(
            eq(knowledgeDocuments.id, documentId),
            eq(knowledgeDocuments.businessId, business.id),
            eq(knowledgeDocuments.agentId, agent.id)
          )
        )
        .limit(1);

      if (!doc) {
        return {
          content: [{ type: 'text', text: 'Knowledge document not found.' }],
          isError: true,
        };
      }

      const [deleted] = await db
        .delete(knowledgeDocuments)
        .where(
          and(
            eq(knowledgeDocuments.id, documentId),
            eq(knowledgeDocuments.businessId, business.id),
            eq(knowledgeDocuments.agentId, agent.id)
          )
        )
        .returning({ id: knowledgeDocuments.id });

      if (!deleted) {
        return {
          content: [{ type: 'text', text: 'Knowledge document could not be deleted.' }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text', text: `Knowledge document deleted: ${deleted.id}` }],
      };
    }
  );

  // ── Tool: list_skills ───────────────────────────────────────────────────────
  server.tool(
    'list_skills',
    'List available skills and currently enabled skills for this business.',
    {},
    async () => {
      const enabled = await getEnabledSkillsForAgentScope({ businessId: business.id, agentId: agent.id });
      const customSkills = await getEnabledCustomWebhookSkillsForAgentScope({
        businessId: business.id,
        agentId: agent.id,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                available: allowedSkillNames,
                enabled,
                customSkills,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── Tool: update_enabled_skills ─────────────────────────────────────────────
  server.tool(
    'update_enabled_skills',
    'Replace enabled skills for this business. Any omitted skill will be disabled.',
    {
      skills: z.array(z.string()).describe('Complete list of skill names to enable'),
    },
    async ({ skills }) => {
      const invalid = skills.filter((name) => !allowedSkillNames.includes(name as (typeof SKILL_NAMES)[number]));
      if (invalid.length > 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid skill names: ${invalid.join(', ')}. Allowed: ${allowedSkillNames.join(', ')}`,
            },
          ],
          isError: true,
        };
      }

      await setEnabledSkillsForAgent(agent.id, skills);
      const enabled = await getEnabledSkillsForAgentScope({ businessId: business.id, agentId: agent.id });
      return {
        content: [{ type: 'text', text: JSON.stringify({ enabled }, null, 2) }],
      };
    }
  );

  // ── Tool: list_integrations ─────────────────────────────────────────────────
  server.tool(
    'list_integrations',
    'List integration status for this business plus active meeting/support integration context.',
    {},
    async () => {
      const [integrations, meetingIntegration, supportIntegration] = await Promise.all([
        getAllIntegrationsForAgentScope({ businessId: business.id, agentId: agent.id }),
        getMeetingIntegrationForAgentScope({ businessId: business.id, agentId: agent.id }),
        getSupportIntegrationForAgentScope({ businessId: business.id, agentId: agent.id }),
      ]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                integrations,
                meetingIntegration,
                supportIntegration,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── Tool: upsert_integration ────────────────────────────────────────────────
  server.tool(
    'upsert_integration',
    'Create or update an integration for this business.',
    {
      provider: z.string().min(1).max(40).describe('Provider slug, e.g. google, zoom, calendly, zendesk'),
      isDefault: z.boolean().optional().describe('Mark this integration as default'),
      accessToken: z.string().max(500).optional().nullable().describe('OAuth access token or API key'),
      config: z.record(z.string()).optional().describe('Provider-specific config values'),
    },
    async ({ provider, isDefault, accessToken, config }) => {
      await upsertIntegrationForAgent(agent.id, provider, {
        ...(isDefault !== undefined ? { isDefault } : {}),
        ...(accessToken !== undefined ? { accessToken } : {}),
        ...(config !== undefined ? { configJson: JSON.stringify(config) } : {}),
      });

      const integrations = await getAllIntegrationsForAgentScope({ businessId: business.id, agentId: agent.id });
      return {
        content: [{ type: 'text', text: JSON.stringify({ provider, integrations }, null, 2) }],
      };
    }
  );

  // ── Tool: disconnect_integration ────────────────────────────────────────────
  server.tool(
    'disconnect_integration',
    'Disconnect an integration by provider for this business.',
    {
      provider: z.string().min(1).max(40).describe('Provider slug to disconnect'),
    },
    async ({ provider }) => {
      await disconnectIntegrationForAgent(agent.id, provider);
      const integrations = await getAllIntegrationsForAgentScope({ businessId: business.id, agentId: agent.id });

      return {
        content: [{ type: 'text', text: JSON.stringify({ provider, integrations }, null, 2) }],
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
          agentId: agent.id,
          urls: JSON.stringify([url]),
          status: 'queued',
        })
        .returning({ id: firecrawlJobs.id });

      const dispatched = await dispatchCrawlJob(job!.id, [url]);
      if (dispatched.mode === 'unavailable') {
        return {
          content: [
            {
              type: 'text',
              text: 'Crawl execution is unavailable. Configure REDIS_URL with crawl worker, or set FIRECRAWL_API_KEY for inline fallback.',
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text:
              dispatched.mode === 'queue'
                ? `Crawl job queued (jobId: ${job!.id}). The URL will be scraped and indexed in the background. Check the Knowledge Base in admin to see when it's ready.`
                : `Crawl job started inline (jobId: ${job!.id}) because queue is unavailable. It will still run in the background from the backend process.`,
          },
        ],
      };
    }
  );

  // ── Tool: trigger_crawl ─────────────────────────────────────────────────────
  server.tool(
    'trigger_crawl',
    'Queue a crawl job for one or more URLs. Only allowed domains are accepted.',
    {
      urls: z.array(z.string().url()).min(1).max(20).describe('URLs to crawl'),
    },
    async ({ urls }) => {
      const safeUrls =
        allowedDomains.length === 0
          ? urls
          : urls.filter((url) => {
              try {
                const hostname = new URL(url).hostname.toLowerCase();
                return allowedDomains.some(
                  (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
                );
              } catch {
                return false;
              }
            });

      if (safeUrls.length === 0) {
        return {
          content: [{ type: 'text', text: 'No URLs passed the domain allowlist check.' }],
          isError: true,
        };
      }

      const [job] = await db
        .insert(firecrawlJobs)
        .values({ businessId: business.id, agentId: agent.id, urls: JSON.stringify(safeUrls), status: 'queued' })
        .returning({ id: firecrawlJobs.id, status: firecrawlJobs.status });

      const dispatched = await dispatchCrawlJob(job!.id, safeUrls);
      if (dispatched.mode === 'unavailable') {
        return {
          content: [
            {
              type: 'text',
              text: 'Crawl execution is unavailable. Configure REDIS_URL with crawl worker, or set FIRECRAWL_API_KEY for inline fallback.',
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                jobId: job!.id,
                status: job!.status,
                acceptedUrls: safeUrls,
                mode: dispatched.mode,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── Tool: list_crawl_jobs ───────────────────────────────────────────────────
  server.tool(
    'list_crawl_jobs',
    'List recent crawl jobs for this business.',
    {
      limit: z.number().min(1).max(100).default(25).describe('Maximum jobs to return (1-100)'),
    },
    async ({ limit }) => {
      const rows = await db
        .select({
          id: firecrawlJobs.id,
          status: firecrawlJobs.status,
          urls: firecrawlJobs.urls,
          errorMessage: firecrawlJobs.errorMessage,
          createdAt: firecrawlJobs.createdAt,
          updatedAt: firecrawlJobs.updatedAt,
        })
        .from(firecrawlJobs)
        .where(agentScopedCrawlWhere)
        .orderBy(desc(firecrawlJobs.createdAt))
        .limit(limit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              rows.map((row) => ({
                ...row,
                hint: getCrawlErrorHint(row.errorMessage),
                urls: (() => {
                  try {
                    return JSON.parse(row.urls);
                  } catch {
                    return [];
                  }
                })(),
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
              })),
              null,
              2
            ),
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
      const config = await buildBusinessConfig();

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
