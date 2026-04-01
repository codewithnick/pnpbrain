/**
 * Long-term AI memory — per-session facts extracted by the agent.
 */
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { conversations } from './conversations.js';
import { businesses } from './businesses.js';

export const memoryFacts = pgTable('memory_facts', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  /** The extracted fact, e.g. "User prefers dark mode." */
  fact: text('fact').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MemoryFact = typeof memoryFacts.$inferSelect;
export type NewMemoryFact = typeof memoryFacts.$inferInsert;
