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
import { getDb } from '@pnpbrain/db/client';
import { knowledgeChunks } from '@pnpbrain/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import type { RagChunk } from '@pnpbrain/types';

type DbClient = ReturnType<typeof getDb>;
type EmbeddingCacheEntry = { vector: number[]; expiresAt: number };

const EMBEDDING_CACHE_TTL_MS = 5 * 60_000;
const EMBEDDING_CACHE_MAX_ENTRIES = 1000;
const embeddingCache = new Map<string, EmbeddingCacheEntry>();

const DEFAULT_KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536;

export type EmbeddingProvider = 'ollama' | 'openai' | 'huggingface' | 'hf';

type ResolvedEmbeddingProvider = 'ollama' | 'openai' | 'huggingface';

export interface EmbeddingModelOptions {
  provider?: EmbeddingProvider;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface EmbeddingConfiguration {
  provider: ResolvedEmbeddingProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

const DEFAULT_HUGGINGFACE_EMBEDDING_BASE_URL = 'https://router.huggingface.co/hf-inference/models';

function normalizeHuggingFaceEmbeddingBaseUrl(baseUrl?: string): string {
  const trimmed = baseUrl?.trim();

  if (!trimmed) {
    return DEFAULT_HUGGINGFACE_EMBEDDING_BASE_URL;
  }

  if (trimmed === 'https://huggingface.co/v1' || trimmed === 'https://router.huggingface.co/v1') {
    return DEFAULT_HUGGINGFACE_EMBEDDING_BASE_URL;
  }

  return trimmed.replace(/\/+$/, '');
}

function buildHuggingFaceEmbeddingUrl(baseUrl: string, model: string): string {
  const normalizedBaseUrl = normalizeHuggingFaceEmbeddingBaseUrl(baseUrl);
  return `${normalizedBaseUrl}/${model}`;
}

function isNumericArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number');
}

function extractEmbeddingVector(payload: unknown): number[] {
  if (isNumericArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload) && payload.length > 0 && isNumericArray(payload[0])) {
    return payload[0];
  }

  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    const embeddings = record['embeddings'];
    if (isNumericArray(embeddings)) {
      return embeddings;
    }
    if (Array.isArray(embeddings) && embeddings.length > 0 && isNumericArray(embeddings[0])) {
      return embeddings[0];
    }
  }

  throw new Error('Unexpected Hugging Face embedding response shape');
}

class HuggingFaceHostedEmbeddings extends Embeddings {
  constructor(
    private readonly config: { model: string; apiKey: string; baseUrl: string }
  ) {
    super({});
  }

  private async requestEmbedding(input: string): Promise<number[]> {
    const response = await fetch(buildHuggingFaceEmbeddingUrl(this.config.baseUrl, this.config.model), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: input,
        options: { wait_for_model: true },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `Hugging Face embedding request failed (${response.status}) for model ${this.config.model}: ${details.slice(0, 300)}`
      );
    }

    const payload = (await response.json()) as unknown;
    return extractEmbeddingVector(payload);
  }

  public async embedDocuments(documents: string[]): Promise<number[][]> {
    return Promise.all(documents.map((document) => this.requestEmbedding(document)));
  }

  public async embedQuery(document: string): Promise<number[]> {
    return this.requestEmbedding(document);
  }
}

function getConfiguredEmbeddingProvider(providerOverride?: EmbeddingProvider): ResolvedEmbeddingProvider {
  const provider = (providerOverride ?? process.env['EMBEDDING_PROVIDER'] ?? 'ollama').toLowerCase();

  if (provider === 'openai') {
    return 'openai';
  }

  if (provider === 'huggingface' || provider === 'hf') {
    return 'huggingface';
  }

  return 'ollama';
}

function getConfiguredEmbeddingModel(
  provider: ResolvedEmbeddingProvider,
  modelOverride?: string
): string {
  if (modelOverride) {
    return modelOverride;
  }

  if (provider === 'openai') {
    return process.env['OPENAI_EMBEDDING_MODEL'] ?? 'text-embedding-3-small';
  }

  if (provider === 'huggingface') {
    return (
      process.env['HUGGINGFACE_EMBEDDING_MODEL'] ??
      process.env['HF_EMBEDDING_MODEL'] ??
      'BAAI/bge-small-en-v1.5'
    );
  }

  return process.env['OLLAMA_EMBEDDING_MODEL'] ?? 'nomic-embed-text';
}

export function getEmbeddingConfiguration(
  options: EmbeddingModelOptions = {}
): EmbeddingConfiguration {
  const provider = getConfiguredEmbeddingProvider(options.provider);
  const model = getConfiguredEmbeddingModel(provider, options.model);

  if (provider === 'openai') {
    const apiKey = options.apiKey ?? process.env['OPENAI_API_KEY'];
    return {
      provider,
      model,
      ...(apiKey ? { apiKey } : {}),
    };
  }

  if (provider === 'huggingface') {
    const apiKey =
      options.apiKey ??
      process.env['HUGGINGFACE_API_KEY'] ??
      process.env['HF_TOKEN'] ??
      process.env['HUGGINGFACEHUB_API_TOKEN'];
    const baseUrl = normalizeHuggingFaceEmbeddingBaseUrl(
      options.baseUrl ??
        process.env['HUGGINGFACE_EMBEDDING_BASE_URL'] ??
        process.env['HF_EMBEDDING_BASE_URL'] ??
        process.env['HUGGINGFACE_BASE_URL'] ??
        process.env['HF_BASE_URL']
    );

    return {
      provider,
      model,
      baseUrl,
      ...(apiKey ? { apiKey } : {}),
    };
  }

  return {
    provider,
    model,
    baseUrl: options.baseUrl ?? process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
  };
}

export function formatEmbeddingConfiguration(options: EmbeddingModelOptions = {}): string {
  const config = getEmbeddingConfiguration(options);
  const baseUrlSuffix = config.baseUrl ? ` baseUrl=${config.baseUrl}` : '';
  return `provider=${config.provider} model=${config.model}${baseUrlSuffix}`;
}

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
  const config = getEmbeddingConfiguration();
  return `${config.provider}:${config.model}:${query.trim().toLowerCase()}`;
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
 * Defaults to Ollama for local dev.
 * Set EMBEDDING_PROVIDER=openai or EMBEDDING_PROVIDER=huggingface to use a hosted API.
 */
export function getEmbeddingModel(options: EmbeddingModelOptions = {}): Embeddings {
  const config = getEmbeddingConfiguration(options);

  if (config.provider === 'openai') {
    // Dynamic import so Ollama users don't need the OpenAI package
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OpenAIEmbeddings } = require('@langchain/openai');
    if (!config.apiKey) throw new Error('OPENAI_API_KEY is not set for embeddings');
    return new OpenAIEmbeddings({
      apiKey: config.apiKey,
      model: config.model,
    });
  }

  if (config.provider === 'huggingface') {
    if (!config.apiKey) {
      throw new Error('HUGGINGFACE_API_KEY (or HF_TOKEN / HUGGINGFACEHUB_API_TOKEN) is not set');
    }

    return new HuggingFaceHostedEmbeddings({
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl ?? DEFAULT_HUGGINGFACE_EMBEDDING_BASE_URL,
    });
  }

  // Default: local Ollama embeddings for offline development.
  return new OllamaEmbeddings({
    baseUrl: config.baseUrl ?? 'http://localhost:11434',
    model: config.model,
  });
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
