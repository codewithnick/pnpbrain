/**
 * Long-term memory helpers.
 *
 * After each conversation turn the agent can extract and persist facts about
 * the customer so future conversations are personalised.
 */

import { getDb } from '@gcfis/db/client';
import { memoryFacts } from '@gcfis/db/schema';
import { eq } from 'drizzle-orm';
import { MEMORY_EXTRACTION_PROMPT } from './prompts.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from './llm.js';

type DbClient = ReturnType<typeof getDb>;

export interface ExtractAndSaveMemoryParams {
  businessId: string;
  conversationId: string;
  userMessage: string;
  assistantResponse: string;
}

export class MemoryService {
  constructor(
    private readonly dbProvider: () => DbClient = getDb,
    private readonly llmService: LlmService = new LlmService()
  ) {}

  public async loadMemoryFacts(conversationId: string): Promise<string[]> {
    const db = this.dbProvider();
    const rows = await db
      .select({ fact: memoryFacts.fact })
      .from(memoryFacts)
      .where(eq(memoryFacts.conversationId, conversationId));

    return rows.map((r) => r.fact);
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
    await db.insert(memoryFacts).values(
      facts.map((fact) => ({
        businessId,
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
