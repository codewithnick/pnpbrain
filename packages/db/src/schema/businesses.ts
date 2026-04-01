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
  ownerUserId: text('owner_user_id').notNull().unique(),
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
  /** Current business-wide spendable credits. */
  creditBalance: integer('credit_balance').notNull().default(100),
  /** Credits granted at signup (default free tier allocation). */
  signupCreditsGranted: integer('signup_credits_granted').notNull().default(100),
  /** Lifetime total credits purchased via top-ups. */
  creditsPurchasedTotal: integer('credits_purchased_total').notNull().default(0),
  /** Lifetime credits consumed by API usage. */
  creditsUsedTotal: integer('credits_used_total').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
