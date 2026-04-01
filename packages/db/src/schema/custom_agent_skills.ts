/**
 * custom_agent_skills — per-agent user-defined webhook tools.
 */
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { businesses } from './businesses';

export const customAgentSkills = pgTable(
  'custom_agent_skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    skillKey: text('skill_key').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    webhookUrl: text('webhook_url').notNull(),
    inputSchemaJson: text('input_schema_json'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cas_agent_skill_key_unique').on(t.agentId, t.skillKey),
  ],
);

export type CustomAgentSkill = typeof customAgentSkills.$inferSelect;
export type NewCustomAgentSkill = typeof customAgentSkills.$inferInsert;
