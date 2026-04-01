/**
 * Long-term memory helpers.
 *
 * After each conversation turn the agent can extract and persist facts about
 * the customer so future conversations are personalised.
 */

import { getDb } from '@gcfis/db/client';
import { agentMemoryFacts, conversations, memoryFacts } from '@gcfis/db/schema';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { MEMORY_EXTRACTION_PROMPT } from './prompts.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from './llm.js';

type DbClient = ReturnType<typeof getDb>;

export interface ExtractAndSaveMemoryParams {
  businessId: string;
  conversationId: string;
  agentId?: string;
  userMessage: string;
  assistantResponse: string;
}

export interface MemoryFactRecord {
  id: string;
  businessId: string;
  conversationId: string;
  fact: string;
  createdAt: Date;
}

export interface AgentMemoryFactRecord {
  id: string;
  businessId: string;
  agentId: string | null;
  fact: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export class MemoryService {
  constructor(
    private readonly dbProvider: () => DbClient = getDb,
    private readonly llmService: LlmService = new LlmService()
  ) {}

  public async listMemoryFacts(params: {
    businessId: string;
    conversationId: string;
  }): Promise<MemoryFactRecord[]> {
    const db = this.dbProvider();
    return db
      .select({
        id: memoryFacts.id,
        businessId: memoryFacts.businessId,
        conversationId: memoryFacts.conversationId,
        fact: memoryFacts.fact,
        createdAt: memoryFacts.createdAt,
      })
      .from(memoryFacts)
      .where(
        and(
          eq(memoryFacts.businessId, params.businessId),
          eq(memoryFacts.conversationId, params.conversationId)
        )
      )
      .orderBy(asc(memoryFacts.createdAt));
  }

  public async loadMemoryFacts(conversationId: string): Promise<string[]> {
    const db = this.dbProvider();
    const rows = await db
      .select({ fact: memoryFacts.fact })
      .from(memoryFacts)
      .where(eq(memoryFacts.conversationId, conversationId));

    return rows.map((r) => r.fact);
  }

  public async listAgentMemoryFacts(params: {
    businessId: string;
    agentId?: string;
  }): Promise<AgentMemoryFactRecord[]> {
    const db = this.dbProvider();
    return db
      .select({
        id: agentMemoryFacts.id,
        businessId: agentMemoryFacts.businessId,
        agentId: agentMemoryFacts.agentId,
        fact: agentMemoryFacts.fact,
        source: agentMemoryFacts.source,
        createdAt: agentMemoryFacts.createdAt,
        updatedAt: agentMemoryFacts.updatedAt,
      })
      .from(agentMemoryFacts)
      .where(
        and(
          eq(agentMemoryFacts.businessId, params.businessId),
          params.agentId
            ? or(eq(agentMemoryFacts.agentId, params.agentId), isNull(agentMemoryFacts.agentId))
            : undefined
        )
      )
      .orderBy(asc(agentMemoryFacts.createdAt));
  }

  public async loadAgentMemoryFacts(businessId: string, agentId?: string): Promise<string[]> {
    const db = this.dbProvider();
    const rows = await db
      .select({ fact: agentMemoryFacts.fact })
      .from(agentMemoryFacts)
      .where(
        and(
          eq(agentMemoryFacts.businessId, businessId),
          agentId
            ? or(eq(agentMemoryFacts.agentId, agentId), isNull(agentMemoryFacts.agentId))
            : undefined
        )
      )
      .orderBy(asc(agentMemoryFacts.createdAt));

    return rows.map((row) => row.fact);
  }

  public async createAgentMemoryFact(params: {
    businessId: string;
    agentId?: string;
    fact: string;
    source?: string;
  }): Promise<AgentMemoryFactRecord> {
    const db = this.dbProvider();
    const [created] = await db
      .insert(agentMemoryFacts)
      .values({
        businessId: params.businessId,
        agentId: params.agentId,
        fact: params.fact,
        source: params.source ?? 'agent',
      })
      .returning({
        id: agentMemoryFacts.id,
        businessId: agentMemoryFacts.businessId,
        agentId: agentMemoryFacts.agentId,
        fact: agentMemoryFacts.fact,
        source: agentMemoryFacts.source,
        createdAt: agentMemoryFacts.createdAt,
        updatedAt: agentMemoryFacts.updatedAt,
      });

    if (!created) {
      throw new Error('Failed to create agent memory fact');
    }

    return created;
  }

  public async updateAgentMemoryFact(params: {
    businessId: string;
    memoryFactId: string;
    fact: string;
  }): Promise<AgentMemoryFactRecord | null> {
    const db = this.dbProvider();
    const [updated] = await db
      .update(agentMemoryFacts)
      .set({ fact: params.fact, updatedAt: new Date() })
      .where(
        and(
          eq(agentMemoryFacts.id, params.memoryFactId),
          eq(agentMemoryFacts.businessId, params.businessId)
        )
      )
      .returning({
        id: agentMemoryFacts.id,
        businessId: agentMemoryFacts.businessId,
        agentId: agentMemoryFacts.agentId,
        fact: agentMemoryFacts.fact,
        source: agentMemoryFacts.source,
        createdAt: agentMemoryFacts.createdAt,
        updatedAt: agentMemoryFacts.updatedAt,
      });

    return updated ?? null;
  }

  public async deleteAgentMemoryFact(params: {
    businessId: string;
    memoryFactId: string;
  }): Promise<boolean> {
    const db = this.dbProvider();
    const [deleted] = await db
      .delete(agentMemoryFacts)
      .where(
        and(
          eq(agentMemoryFacts.id, params.memoryFactId),
          eq(agentMemoryFacts.businessId, params.businessId)
        )
      )
      .returning({ id: agentMemoryFacts.id });

    return Boolean(deleted);
  }

  public async createMemoryFact(params: {
    businessId: string;
    conversationId: string;
    fact: string;
  }): Promise<MemoryFactRecord> {
    await this.ensureConversationBelongsToBusiness(params.businessId, params.conversationId);

    const db = this.dbProvider();
    const [created] = await db
      .insert(memoryFacts)
      .values({
        businessId: params.businessId,
        conversationId: params.conversationId,
        fact: params.fact,
      })
      .returning({
        id: memoryFacts.id,
        businessId: memoryFacts.businessId,
        conversationId: memoryFacts.conversationId,
        fact: memoryFacts.fact,
        createdAt: memoryFacts.createdAt,
      });

    if (!created) {
      throw new Error('Failed to create memory fact');
    }

    return created;
  }

  public async updateMemoryFact(params: {
    businessId: string;
    memoryFactId: string;
    fact: string;
  }): Promise<MemoryFactRecord | null> {
    const db = this.dbProvider();
    const [updated] = await db
      .update(memoryFacts)
      .set({ fact: params.fact })
      .where(
        and(
          eq(memoryFacts.id, params.memoryFactId),
          eq(memoryFacts.businessId, params.businessId)
        )
      )
      .returning({
        id: memoryFacts.id,
        businessId: memoryFacts.businessId,
        conversationId: memoryFacts.conversationId,
        fact: memoryFacts.fact,
        createdAt: memoryFacts.createdAt,
      });

    return updated ?? null;
  }

  public async deleteMemoryFact(params: {
    businessId: string;
    memoryFactId: string;
  }): Promise<boolean> {
    const db = this.dbProvider();
    const [deleted] = await db
      .delete(memoryFacts)
      .where(
        and(
          eq(memoryFacts.id, params.memoryFactId),
          eq(memoryFacts.businessId, params.businessId)
        )
      )
      .returning({ id: memoryFacts.id });

    return Boolean(deleted);
  }

  public async extractAndSaveMemory(params: ExtractAndSaveMemoryParams): Promise<string[]> {
    const { businessId, conversationId, userMessage, assistantResponse } = params;

    const llm = this.llmService.getSyncModel();
    const exchangeSummary = `User: ${userMessage}\nAssistant: ${assistantResponse}`;

    const response = await llm.invoke([
      new SystemMessage(MEMORY_EXTRACTION_PROMPT),
      new HumanMessage(exchangeSummary),
    ]);

    const raw =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    // Parse the JSON array returned by the LLM
    let facts: string[] = [];
    try {
      // Find JSON array in the response (LLM might add extra text)
      const match = /\[.*\]/s.exec(raw);
      if (match) {
        const parsed: unknown = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          facts = parsed.filter((f): f is string => typeof f === 'string');
        }
      }
    } catch {
      // If parsing fails, skip — memory extraction is best-effort
      return [];
    }

    if (facts.length === 0) return [];

    const db = this.dbProvider();
    const [conversation] = await db
      .select({ agentId: conversations.agentId })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.businessId, businessId)))
      .limit(1);

    await db.insert(memoryFacts).values(
      facts.map((fact) => ({
        businessId,
        agentId: params.agentId ?? conversation?.agentId ?? null,
        conversationId,
        fact,
      }))
    );

    return facts;
  }

  public formatMemoryFacts(facts: string[]): string {
    if (facts.length === 0) return '';
    return facts.map((f, i) => `${i + 1}. ${f}`).join('\n');
  }

  private async ensureConversationBelongsToBusiness(
    businessId: string,
    conversationId: string
  ): Promise<void> {
    const db = this.dbProvider();
    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(eq(conversations.id, conversationId), eq(conversations.businessId, businessId))
      )
      .limit(1);

    if (!conversation) {
      throw new Error('Conversation not found');
    }
  }
}

const defaultMemoryService = new MemoryService();

/**
 * Loads all memory facts for a conversation from the database.
 *
 * @param conversationId - UUID of the conversation
 * @returns Array of fact strings
 */
export async function loadMemoryFacts(conversationId: string): Promise<string[]> {
  return defaultMemoryService.loadMemoryFacts(conversationId);
}

/**
 * Uses the LLM to extract new memory facts from the latest conversation turn,
 * then persists them to the database.
 *
 * @param params - Context for extraction
 */
export async function extractAndSaveMemory(params: ExtractAndSaveMemoryParams): Promise<string[]> {
  return defaultMemoryService.extractAndSaveMemory(params);
}

/**
 * Formats memory facts into a readable string for the system prompt.
 */
export function formatMemoryFacts(facts: string[]): string {
  return defaultMemoryService.formatMemoryFacts(facts);
}
