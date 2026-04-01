/**
 * Billing helpers — trial enforcement, Stripe integration, usage recording.
 *
 * Pay-as-you-go model:
 *   - 7-day free trial (tracked via `trialEndsAt` on the business row)
 *   - After trial: Stripe metered subscription required
 *   - Usage is reported per message to Stripe for automated invoicing
 */

import Stripe from 'stripe';
import { getDb } from '@gcfis/db/client';
import { businesses } from '@gcfis/db/schema';
import { eq, sql } from 'drizzle-orm';
import type { Business } from '@gcfis/db';

// ─── Stripe client ────────────────────────────────────────────────────────────

function getStripe(): Stripe {
  const key = process.env['STRIPE_SECRET_KEY'];
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return new Stripe(key);
}

// ─── Status helpers ───────────────────────────────────────────────────────────

/**
 * Returns true when the business is allowed to send messages.
 * True during an active trial or when subscribed (active / past_due grace).
 */
export function isBusinessActive(business: Business): boolean {
  if (business.subscriptionStatus === 'trialing') {
    return new Date(business.trialEndsAt) > new Date();
  }
  return (
    business.subscriptionStatus === 'active' ||
    business.subscriptionStatus === 'past_due'
  );
}

/**
 * Detailed billing status object returned to the admin UI.
 */
export function getBillingStatus(business: Business) {
  const now = new Date();
  const trialEnd = new Date(business.trialEndsAt);
  const isTrialing = business.subscriptionStatus === 'trialing';
  const trialDaysRemaining = isTrialing
    ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    status: business.subscriptionStatus,
    isActive: isBusinessActive(business),
    isTrialing,
    trialExpired: isTrialing && trialEnd <= now,
    trialEndsAt: business.trialEndsAt.toISOString(),
    trialDaysRemaining,
    currentPeriodEnd: business.currentPeriodEnd?.toISOString() ?? null,
    messagesUsedTotal: business.messagesUsedTotal,
    hasStripeCustomer: Boolean(business.stripeCustomerId),
  };
}

// ─── Stripe customer ──────────────────────────────────────────────────────────

/**
 * Returns the existing Stripe customer ID or creates a new one.
 * Persists the customer ID to the DB on creation.
 */
export async function getOrCreateStripeCustomer(
  business: Business,
  email: string
): Promise<string> {
  if (business.stripeCustomerId) return business.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: business.name,
    email,
    metadata: { businessId: business.id },
  });

  await getDb()
    .update(businesses)
    .set({ stripeCustomerId: customer.id, updatedAt: sql`now()` })
    .where(eq(businesses.id, business.id));

  return customer.id;
}

// ─── Stripe Checkout ──────────────────────────────────────────────────────────

/**
 * Creates a Stripe Checkout Session for the business owner to subscribe.
 * Returns the hosted checkout URL.
 *
 * @param business   - The business row
 * @param email      - Owner's email (used to prefill / create Stripe customer)
 * @param returnUrl  - URL the user is sent back to after checkout
 */
export async function createCheckoutSession(
  business: Business,
  email: string,
  returnUrl: string
): Promise<string> {
  const priceId = process.env['STRIPE_PRICE_ID'];
  if (!priceId) throw new Error('STRIPE_PRICE_ID is not configured');

  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(business, email);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId }],
    subscription_data: {
      metadata: { businessId: business.id },
    },
    success_url: `${returnUrl}?billing=success`,
    cancel_url: `${returnUrl}?billing=canceled`,
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return session.url;
}

// ─── Stripe Portal ────────────────────────────────────────────────────────────

/**
 * Creates a Stripe Billing Portal session so the owner can manage their
 * subscription, update payment methods, and download invoices.
 * Returns the hosted portal URL.
 */
export async function createPortalSession(
  business: Business,
  returnUrl: string
): Promise<string> {
  if (!business.stripeCustomerId) {
    throw new Error('No Stripe customer associated with this business');
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: business.stripeCustomerId,
    return_url: returnUrl,
  });

  return session.url;
}

// ─── Usage recording ──────────────────────────────────────────────────────────

/**
 * Records one message unit of usage:
 *   1. Increments `messagesUsedTotal` in the DB.
 *   2. Reports +1 to Stripe for metered billing (if subscription exists).
 *
 * Designed to be called fire-and-forget (non-blocking from chat route).
 */
export async function recordMessageUsage(business: Business): Promise<void> {
  // Atomically increment the counter
  await getDb()
    .update(businesses)
    .set({
      messagesUsedTotal: sql`${businesses.messagesUsedTotal} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(businesses.id, business.id));

  // Report to Stripe metered billing (only when subscription is active)
  if (business.stripeSubscriptionItemId) {
    try {
      const stripe = getStripe();
      const usageApi = (stripe as unknown as {
        subscriptionItems?: {
          createUsageRecord?: (
            subscriptionItemId: string,
            usage: { quantity: number; action: 'increment' }
          ) => Promise<unknown>;
        };
      }).subscriptionItems?.createUsageRecord;

      if (usageApi) {
        await usageApi(business.stripeSubscriptionItemId, {
          quantity: 1,
          action: 'increment',
        });
      }
    } catch (err) {
      // Log but don't fail — usage can be reconciled later
      console.error('[billing] Stripe usage report failed:', err);
    }
  }
}

// ─── Webhook helpers ──────────────────────────────────────────────────────────

/**
 * Maps a Stripe subscription status string to our internal status enum.
 */
function mapStripeStatus(
  stripeStatus: string
): 'active' | 'past_due' | 'canceled' {
  switch (stripeStatus) {
    case 'active':
    case 'trialing': // Stripe-level trial (not used, but safe to handle)
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    default:
      return 'canceled';
  }
}

/**
 * Syncs a Stripe subscription object into the businesses table.
 * Called by the webhook handler.
 */
export async function syncStripeSubscription(sub: Stripe.Subscription): Promise<void> {
  const businessId = sub.metadata['businessId'];
  if (!businessId) {
    console.warn('[billing] Subscription missing businessId metadata:', sub.id);
    return;
  }

  const item = sub.items.data[0];
  const status = mapStripeStatus(sub.status);
  const currentPeriodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;

  await getDb()
    .update(businesses)
    .set({
      stripeSubscriptionId: sub.id,
      stripeSubscriptionItemId: item?.id ?? null,
      subscriptionStatus: status,
      currentPeriodEnd:
        typeof currentPeriodEnd === 'number'
          ? new Date(currentPeriodEnd * 1000)
          : null,
      updatedAt: sql`now()`,
    })
    .where(eq(businesses.id, businessId));
}

/**
 * Marks the business as canceled when a subscription is deleted in Stripe.
 */
export async function cancelSubscription(sub: Stripe.Subscription): Promise<void> {
  const businessId = sub.metadata['businessId'];
  if (!businessId) return;

  await getDb()
    .update(businesses)
    .set({
      subscriptionStatus: 'canceled',
      stripeSubscriptionId: null,
      stripeSubscriptionItemId: null,
      currentPeriodEnd: null,
      updatedAt: sql`now()`,
    })
    .where(eq(businesses.id, businessId));
}

/**
 * Verifies and constructs a Stripe webhook event from raw request bytes.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  return getStripe().webhooks.constructEvent(payload, signature, secret);
}
