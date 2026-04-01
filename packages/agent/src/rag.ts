/**
 * RAG (Retrieval-Augmented Generation) helpers.
 *
 * Handles:
 *  1. Chunking documents into overlapping text slices
 *  2. Generating embeddings via Ollama (nomic-embed-text) or OpenAI
 *  3. Cosine similarity search against pgvector
 */

import { OllamaEmbeddings } from '@langchain/ollama';
import { Embeddings } from '@langchain/core/embeddings';
import { getDb } from '@gcfis/db/client';
import { knowledgeChunks } from '@gcfis/db/schema';
import { eq, sql } from 'drizzle-orm';
import type { RagChunk } from '@gcfis/types';

type DbClient = ReturnType<typeof getDb>;

// ─── Embedding factory ────────────────────────────────────────────────────────

/**
 * Returns an embedding model.
 * Defaults to Ollama nomic-embed-text for local dev.
 * Set EMBEDDING_PROVIDER=openai to use OpenAI text-embedding-3-small.
 */
export function getEmbeddingModel(): Embeddings {
  const provider = process.env['EMBEDDING_PROVIDER'] ?? 'ollama';

  if (provider === 'openai') {
    // Dynamic import so Ollama users don't need the OpenAI package
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OpenAIEmbeddings } = require('@langchain/openai');
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set for embeddings');
    return new OpenAIEmbeddings({ apiKey, model: 'text-embedding-3-small' });
  }

  // Default: Ollama nomic-embed-text (1536 dims — same shape as OpenAI small)
  const baseUrl = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434';
  return new OllamaEmbeddings({ baseUrl, model: 'nomic-embed-text' });
}

export class RagService {
  constructor(
    private readonly dbProvider: () => DbClient = getDb,
    private readonly embeddingFactory: () => Embeddings = getEmbeddingModel
  ) {}

  public chunkText(text: string, chunkSize = 800, overlap = 100): TextChunk[] {
    const chunks: TextChunk[] = [];
    let start = 0;
    let index = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push({ content: text.slice(start, end), index });
      index++;
      start += chunkSize - overlap;
    }

    return chunks;
  }

  public async retrieveKnowledgeChunks(
    businessId: string,
    query: string,
    topK = 5
  ): Promise<RagChunk[]> {
    const embeddings = this.embeddingFactory();
    const [queryVector] = await embeddings.embedDocuments([query]);

    if (!queryVector || queryVector.length === 0) {
      return [];
    }

    const db = this.dbProvider();
    const vectorString = `[${queryVector.join(',')}]`;

    // Use pgvector cosine distance operator (<=>)
    const rows = await db
      .select({
        id: knowledgeChunks.id,
        content: knowledgeChunks.content,
        // Cosine similarity = 1 - cosine distance
        score: sql<number>`1 - (${knowledgeChunks.embedding} <=> ${vectorString}::vector)`,
      })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.businessId, businessId))
      .orderBy(sql`${knowledgeChunks.embedding} <=> ${vectorString}::vector`)
      .limit(topK);

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      score: row.score,
    }));
  }

  public formatRagContext(chunks: RagChunk[]): string {
    if (chunks.length === 0) return '';
    return chunks
      .map((c, i) => `[Source ${i + 1}] (relevance: ${(c.score * 100).toFixed(0)}%)\n${c.content}`)
      .join('\n\n---\n\n');
  }
}

const defaultRagService = new RagService();

// ─── Chunking ─────────────────────────────────────────────────────────────────

export interface TextChunk {
  content: string;
  index: number;
}

/**
 * Splits text into overlapping chunks for embedding.
 *
 * @param text - Full document text
 * @param chunkSize - Target characters per chunk (default 800)
 * @param overlap - Character overlap between chunks (default 100)
 */
export function chunkText(
  text: string,
  chunkSize = 800,
  overlap = 100
): TextChunk[] {
  return defaultRagService.chunkText(text, chunkSize, overlap);
}

// ─── Retrieval ────────────────────────────────────────────────────────────────

/**
 * Retrieves the top-k most relevant knowledge chunks for a query from pgvector.
 *
 * @param businessId - Scopes the search to one business's knowledge base
 * @param query - The user's question / search query
 * @param topK - Number of chunks to return (default 5)
 * @returns Array of RagChunk sorted by similarity descending
 */
export async function retrieveKnowledgeChunks(
  businessId: string,
  query: string,
  topK = 5
): Promise<RagChunk[]> {
  return defaultRagService.retrieveKnowledgeChunks(businessId, query, topK);
}

/**
 * Formats RAG chunks into a readable context string for the system prompt.
 */
export function formatRagContext(chunks: RagChunk[]): string {
  return defaultRagService.formatRagContext(chunks);
}
