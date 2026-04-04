ALTER TABLE "businesses" ALTER COLUMN "credit_balance" SET DEFAULT 200;--> statement-breakpoint
ALTER TABLE "businesses" ALTER COLUMN "signup_credits_granted" SET DEFAULT 200;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "plan_tier" text DEFAULT 'freemium' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "placeholder" text DEFAULT 'Type a message...' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "assistant_avatar_mode" text DEFAULT 'initial' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "assistant_avatar_text" text DEFAULT 'A' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "assistant_avatar_image_url" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "show_assistant_avatar" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "show_user_avatar" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "user_avatar_text" text DEFAULT 'You' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "header_subtitle" text DEFAULT 'Online' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "chat_background_color" text DEFAULT '#f9fafb' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "user_message_color" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "assistant_message_color" text DEFAULT '#ffffff' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "border_radius_px" integer DEFAULT 16 NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "show_powered_by" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "knowledge_chunks_document_chunk_idx" ON "knowledge_chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_business_agent_idx" ON "knowledge_chunks" USING btree ("business_id","agent_id");--> statement-breakpoint
CREATE INDEX "knowledge_documents_business_updated_idx" ON "knowledge_documents" USING btree ("business_id","updated_at");--> statement-breakpoint
CREATE INDEX "knowledge_documents_agent_updated_idx" ON "knowledge_documents" USING btree ("agent_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_business_updated_idx" ON "conversations" USING btree ("business_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_agent_updated_idx" ON "conversations" USING btree ("agent_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_business_created_idx" ON "conversations" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_memory_facts_business_agent_idx" ON "agent_memory_facts" USING btree ("business_id","agent_id");--> statement-breakpoint
CREATE INDEX "memory_facts_business_conversation_idx" ON "memory_facts" USING btree ("business_id","conversation_id");--> statement-breakpoint
CREATE INDEX "memory_facts_business_agent_idx" ON "memory_facts" USING btree ("business_id","agent_id");