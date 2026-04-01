/**
 * Knowledge base types.
 */

export interface KnowledgeBase {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  /** Allowed domains for Firecrawl (enforced during tool execution) */
  allowedDomains: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  content: string;
  /** pgvector embedding (not sent to clients, kept internal) */
  // embedding: number[];
  chunkIndex: number;
  createdAt: string;
}
