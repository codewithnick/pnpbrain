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
import { and, eq, sql } from 'drizzle-orm';
import type { RagChunk } from '@gcfis/types';

type DbClient = ReturnType<typeof getDb>;
type EmbeddingCacheEntry = { vector: number[]; expiresAt: number };

const EMBEDDING_CACHE_TTL_MS = 5 * 60_000;
const EMBEDDING_CACHE_MAX_ENTRIES = 1000;
const embeddingCache = new Map<string, EmbeddingCacheEntry>();

const DEFAULT_KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536;

function getConfiguredEmbeddingDimensions(): number {
  const configured = Number.parseInt(
    process.env['KNOWLEDGE_EMBEDDING_DIMENSIONS'] ?? `${DEFAULT_KNOWLEDGE_EMBEDDING_DIMENSIONS}`,
    10
  );

  if (Number.isNaN(configured) || configured < 1) {
    return DEFAULT_KNOWLEDGE_EMBEDDING_DIMENSIONS;
  }

  return configured;
}

function buildEmbeddingCacheKey(query: string): string {
  const provider = process.env['EMBEDDING_PROVIDER'] ?? 'ollama';
  return `${provider}:${query.trim().toLowerCase()}`;
}

function getCachedEmbedding(cacheKey: string): number[] | null {
  const existing = embeddingCache.get(cacheKey);
  if (!existing) return null;
  if (existing.expiresAt <= Date.now()) {
    embeddingCache.delete(cacheKey);
    return null;
  }

  // Touch entry to keep most recently used keys around longer.
  embeddingCache.delete(cacheKey);
  embeddingCache.set(cacheKey, existing);
  return existing.vector;
}

function setCachedEmbedding(cacheKey: string, vector: number[]): void {
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX_ENTRIES) {
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey) {
      embeddingCache.delete(firstKey);
    }
  }
  embeddingCache.set(cacheKey, {
    vector,
    expiresAt: Date.now() + EMBEDDING_CACHE_TTL_MS,
  });
}

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

export function normalizeEmbeddingVector(vector: number[]): number[] {
  const targetDimensions = getConfiguredEmbeddingDimensions();

  if (vector.length === targetDimensions) {
    return vector;
  }

  if (vector.length > targetDimensions) {
    return vector.slice(0, targetDimensions);
  }

  return [...vector, ...new Array<number>(targetDimensions - vector.length).fill(0)];
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
    agentId: string | undefined,
    query: string,
    topK = 5
  ): Promise<RagChunk[]> {
    const embeddings = this.embeddingFactory();
    const cacheKey = buildEmbeddingCacheKey(query);
    const cached = getCachedEmbedding(cacheKey);
    let queryVector = cached ?? null;

    if (!queryVector) {
      const [embeddedVector] = await embeddings.embedDocuments([query]);
      queryVector = embeddedVector ? normalizeEmbeddingVector(embeddedVector) : null;
      if (queryVector && queryVector.length > 0) {
        setCachedEmbedding(cacheKey, queryVector);
      }
    }

    if (!queryVector || queryVector.length === 0) {
      return [];
    }

    if (!agentId) {
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
      .where(
        and(
          eq(knowledgeChunks.businessId, businessId),
          eq(knowledgeChunks.agentId, agentId)
        )
      )
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
  agentId: string | undefined,
  query: string,
  topK = 5
): Promise<RagChunk[]> {
  return defaultRagService.retrieveKnowledgeChunks(businessId, agentId, query, topK);
}

/**
 * Formats RAG chunks into a readable context string for the system prompt.
 */
export function formatRagContext(chunks: RagChunk[]): string {
  return defaultRagService.formatRagContext(chunks);
}
