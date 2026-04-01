/**
 * Knowledge base tables — documents + chunks with pgvector embeddings.
 *
 * Requires the pgvector extension:
 *   CREATE EXTENSION IF NOT EXISTS vector;
 */
import { sql } from 'drizzle-orm';
import {
  customType,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

/**
 * pgvector custom column type.
 * Drizzle doesn't ship a first-party vector type yet so we roll our own.
 */
export const vector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`;
    },
    fromDriver(value: string): number[] {
      return value
        .replace(/[\[\]]/g, '')
        .split(',')
        .map(Number);
    },
  })(name);

/** Raw knowledge documents uploaded by the business owner */
export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  sourceUrl: text('source_url'),
  s3Bucket: text('s3_bucket'),
  s3Key: text('s3_key'),
  contentType: text('content_type'),
  sizeBytes: integer('size_bytes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Chunked + embedded slices of knowledge documents for RAG */
export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => knowledgeDocuments.id, { onDelete: 'cascade' }),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  /** 1536-dim embeddings (OpenAI text-embedding-3-small or Ollama nomic-embed-text) */
  embedding: vector('embedding', 1536),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type NewKnowledgeDocument = typeof knowledgeDocuments.$inferInsert;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type NewKnowledgeChunk = typeof knowledgeChunks.$inferInsert;
