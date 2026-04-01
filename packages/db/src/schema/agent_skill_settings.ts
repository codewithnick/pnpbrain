/**
 * agent_skill_settings — per-agent skill enablement and optional config.
 */
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { SKILL_NAMES } from './skills';

export const agentSkillSettings = pgTable(
  'agent_skill_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    skillName: text('skill_name', { enum: SKILL_NAMES }).notNull(),
    enabled: boolean('enabled').notNull().default(false),
    config: text('config').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ass_agent_skill_unique').on(t.agentId, t.skillName)],
);

export type AgentSkillSetting = typeof agentSkillSettings.$inferSelect;
export type NewAgentSkillSetting = typeof agentSkillSettings.$inferInsert;