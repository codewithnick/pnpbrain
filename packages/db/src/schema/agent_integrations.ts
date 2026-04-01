/**
 * agent_integrations — one row per provider per agent.
 */
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { agents } from './agents';

export const agentIntegrations = pgTable(
  'agent_integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    configJson: text('config_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ai_agent_provider_unique').on(t.agentId, t.provider)],
);

export type AgentIntegration = typeof agentIntegrations.$inferSelect;
export type NewAgentIntegration = typeof agentIntegrations.$inferInsert;