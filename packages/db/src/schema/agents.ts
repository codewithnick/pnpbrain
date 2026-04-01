/**
 * agents (projects) — business-scoped AI agent instances.
 *
 * A business can own many agents. Agent-level settings override business defaults.
 */
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    isDefault: boolean('is_default').notNull().default(false),
    allowedDomains: text('allowed_domains').notNull().default('[]'),
    llmProvider: text('llm_provider').notNull().default('ollama'),
    llmModel: text('llm_model').notNull().default('llama3.1:8b'),
    llmApiKey: text('llm_api_key'),
    llmBaseUrl: text('llm_base_url'),
    primaryColor: text('primary_color').notNull().default('#6366f1'),
    botName: text('bot_name').notNull().default('GCFIS Assistant'),
    welcomeMessage: text('welcome_message').notNull().default('Hi! How can I help you today?'),
    widgetPosition: text('widget_position').notNull().default('bottom-right'),
    widgetTheme: text('widget_theme').notNull().default('light'),
    showAvatar: boolean('show_avatar').notNull().default(true),
    agentApiKey: text('agent_api_key').unique(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('agents_business_slug_unique').on(t.businessId, t.slug),
    uniqueIndex('agents_business_name_unique').on(t.businessId, t.name),
  ],
);

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
