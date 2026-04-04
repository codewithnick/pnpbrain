/**
 * Long-term AI memory — per-session facts extracted by the agent.
 */
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { conversations } from './conversations';
import { businesses } from './businesses';
import { agents } from './agents';

export const memoryFacts = pgTable(
  'memory_facts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    /** The extracted fact, e.g. "User prefers dark mode." */
    fact: text('fact').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('memory_facts_business_conversation_idx').on(t.businessId, t.conversationId),
    index('memory_facts_business_agent_idx').on(t.businessId, t.agentId),
  ],
);

export const agentMemoryFacts = pgTable(
  'agent_memory_facts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    /** Agent-authored long-term memory not tied to one conversation. */
    fact: text('fact').notNull(),
    /** Origin for traceability, e.g. "crawl", "chat", "manual". */
    source: text('source').notNull().default('agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('agent_memory_facts_business_agent_idx').on(t.businessId, t.agentId)],
);

export type MemoryFact = typeof memoryFacts.$inferSelect;
export type NewMemoryFact = typeof memoryFacts.$inferInsert;
export type AgentMemoryFact = typeof agentMemoryFacts.$inferSelect;
export type NewAgentMemoryFact = typeof agentMemoryFacts.$inferInsert;
