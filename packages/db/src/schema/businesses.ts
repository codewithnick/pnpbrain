/**
 * Businesses table — each business owner has one entry.
 */
import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Display name */
  name: text('name').notNull(),
  /**
   * URL-safe slug used in the public chat URL: app.com/<slug>
   * Unique across all businesses.
   */
  slug: text('slug').notNull().unique(),
  /** Short description used to give the agent business context */
  description: text('description').notNull().default(''),
  /** Supabase Auth user ID of the owner */
  ownerUserId: text('owner_user_id').notNull(),
  /**
   * Comma-separated list of allowed domains for Firecrawl.
   * Stored as JSON array string for simplicity; parsed at runtime.
   */
  allowedDomains: text('allowed_domains').notNull().default('[]'),
  /**
   * JSON-encoded array of enabled skill names.
   * e.g. '["calculator","datetime","firecrawl"]'
   * Defaults to calculator + datetime; firecrawl requires explicit opt-in.
   */
  enabledSkills: text('enabled_skills').notNull().default('["calculator","datetime"]'),
  // ── LLM configuration (per-business overrides) ─────────────────────────
  /** LLM provider: 'ollama' | 'openai' | 'anthropic'. Falls back to server env. */
  llmProvider: text('llm_provider').notNull().default('ollama'),
  /** Model tag, e.g. 'llama3.1:8b', 'gpt-4o-mini', 'claude-3-5-haiku-20241022' */
  llmModel: text('llm_model').notNull().default('llama3.1:8b'),
  /**
   * API key for cloud providers — stored encrypted at rest (Supabase column encryption).
   * Null when using Ollama.
   */
  llmApiKey: text('llm_api_key'),
  /** Base URL for self-hosted Ollama; null to use server default. */
  llmBaseUrl: text('llm_base_url'),
  /** Primary colour for the widget */
  primaryColor: text('primary_color').notNull().default('#6366f1'),
  botName: text('bot_name').notNull().default('GCFIS Assistant'),
  welcomeMessage: text('welcome_message').notNull().default('Hi! How can I help you today?'),
  /** Widget position on the page */
  widgetPosition: text('widget_position').notNull().default('bottom-right'),
  /** 'light' | 'dark' */
  widgetTheme: text('widget_theme').notNull().default('light'),
  /** Show agent avatar in the chat window */
  showAvatar: boolean('show_avatar').notNull().default(true),
  // ── Billing ──────────────────────────────────────────────────────────────
  /**
   * When the 7-day free trial expires.
   * Defaults to 7 days after row creation via $defaultFn.
   */
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  /**
   * Current billing status.
   *   trialing   — within free trial window
   *   active     — paying subscriber
   *   past_due   — payment failed but grace period active
   *   canceled   — subscription ended / trial expired without subscribing
   */
  subscriptionStatus: text('subscription_status', {
    enum: ['trialing', 'active', 'past_due', 'canceled'],
  })
    .notNull()
    .default('trialing'),
  /** Stripe Customer ID (cus_xxx). Populated on first checkout. */
  stripeCustomerId: text('stripe_customer_id'),
  /** Stripe Subscription ID (sub_xxx). Populated after checkout. */
  stripeSubscriptionId: text('stripe_subscription_id'),
  /**
   * Stripe Subscription Item ID (si_xxx).
   * Required for reporting metered usage via the Stripe API.
   */
  stripeSubscriptionItemId: text('stripe_subscription_item_id'),
  /** End of the current billing period; null before first subscription. */
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  /** Running total of AI messages processed (for display / analytics). */
  messagesUsedTotal: integer('messages_used_total').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
