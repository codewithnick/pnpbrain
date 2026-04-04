CREATE INDEX IF NOT EXISTS "conversations_business_updated_idx"
  ON "conversations" ("business_id", "updated_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_agent_updated_idx"
  ON "conversations" ("agent_id", "updated_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_business_created_idx"
  ON "conversations" ("business_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_created_idx"
  ON "messages" ("conversation_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_facts_business_conversation_idx"
  ON "memory_facts" ("business_id", "conversation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_facts_business_agent_idx"
  ON "memory_facts" ("business_id", "agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_memory_facts_business_agent_idx"
  ON "agent_memory_facts" ("business_id", "agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_documents_business_updated_idx"
  ON "knowledge_documents" ("business_id", "updated_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_documents_agent_updated_idx"
  ON "knowledge_documents" ("agent_id", "updated_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunks_document_chunk_idx"
  ON "knowledge_chunks" ("document_id", "chunk_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunks_business_agent_idx"
  ON "knowledge_chunks" ("business_id", "agent_id");
--> statement-breakpoint
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_hnsw"
    ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Skipping knowledge_chunks_embedding_hnsw because pgvector support is not available.';
END
$$;