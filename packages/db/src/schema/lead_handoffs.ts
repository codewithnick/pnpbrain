/**
 * lead_handoffs — tracks sales handoffs sent to CRM or automation systems.
 */
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { conversations } from './conversations';
import { agents } from './agents';

export const leadHandoffs = pgTable('lead_handoffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  externalRecordId: text('external_record_id'),
  externalRecordUrl: text('external_record_url'),
  status: text('status', { enum: ['created', 'failed'] }).notNull().default('created'),
  qualificationScore: integer('qualification_score'),
  qualificationStage: text('qualification_stage'),
  reason: text('reason').notNull(),
  customerEmail: text('customer_email'),
  customerName: text('customer_name'),
  companyName: text('company_name'),
  summary: text('summary').notNull(),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type LeadHandoff = typeof leadHandoffs.$inferSelect;
export type NewLeadHandoff = typeof leadHandoffs.$inferInsert;