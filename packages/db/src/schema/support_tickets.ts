/**
 * support_tickets — tracks escalations sent to third-party support systems.
 */
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { conversations } from './conversations';

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  externalTicketId: text('external_ticket_id'),
  externalTicketUrl: text('external_ticket_url'),
  status: text('status', { enum: ['created', 'failed'] }).notNull().default('created'),
  reason: text('reason').notNull(),
  customerEmail: text('customer_email'),
  customerName: text('customer_name'),
  customerMessage: text('customer_message').notNull(),
  assistantMessage: text('assistant_message'),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;