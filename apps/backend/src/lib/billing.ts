/**
 * Billing helpers — trial enforcement, Stripe integration, usage recording.
 *
 * Pay-as-you-go model:
 *   - 7-day free trial (tracked via `trialEndsAt` on the business row)
 *   - After trial: Stripe metered subscription required
 *   - Usage is reported per message to Stripe for automated invoicing
 */

import Stripe from 'stripe';
import Razorpay from 'razorpay';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getDb } from '@pnpbrain/db/client';
import { businessCreditLedger, businesses } from '@pnpbrain/db/schema';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { Business } from '@pnpbrain/db';

export const TOP_UP_MEDIUMS = ['any', 'card', 'wallet', 'bank_debit', 'razorpay', 'wise', 'manual'] as const;
export type TopUpMedium = (typeof TOP_UP_MEDIUMS)[number];

export const PLAN_TIERS = ['freemium', 'lite', 'basic', 'pro', 'custom'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

type PlanDefinition = {
  tier: PlanTier;
  label: string;
  monthlyMessages: number | null;
  requiresSupport: boolean;
};

const PLAN_DEFINITIONS: Record<PlanTier, PlanDefinition> = {
  freemium: {
    tier: 'freemium',
    label: 'Freemium',
    monthlyMessages: 200,
    requiresSupport: false,
  },
  lite: {
    tier: 'lite',
    label: 'Lite',
    monthlyMessages: 2_000,
    requiresSupport: false,
  },
  basic: {
    tier: 'basic',
    label: 'Basic',
    monthlyMessages: 10_000,
    requiresSupport: false,
  },
  pro: {
    tier: 'pro',
    label: 'Pro',
    monthlyMessages: 50_000,
    requiresSupport: false,
  },
  custom: {
    tier: 'custom',
    label: 'Custom',
    monthlyMessages: null,
    requiresSupport: true,
  },
};

const BILLING_PERIOD_DAYS = 30;

function getPlanDefinition(planTierRaw: string | null | undefined): PlanDefinition {
  const normalized = String(planTierRaw ?? 'freemium').toLowerCase();
  if (PLAN_TIERS.includes(normalized as PlanTier)) {
    return PLAN_DEFINITIONS[normalized as PlanTier];
  }

  return PLAN_DEFINITIONS.freemium;
}

function getStripePriceIdForPlan(tier: PlanTier): string {
  if (tier === 'freemium' || tier === 'custom') {
    throw new Error('This plan does not use self-serve checkout');
  }

  const envMap: Partial<Record<Exclude<PlanTier, 'freemium' | 'custom'>, string | undefined>> = {
    lite: process.env['STRIPE_PRICE_ID_LITE'],
    basic: process.env['STRIPE_PRICE_ID_BASIC'],
    pro: process.env['STRIPE_PRICE_ID_PRO'],
  };

  const selected = envMap[tier];
  if (selected) return selected;

  const fallback = process.env['STRIPE_PRICE_ID'];
  if (!fallback) {
    throw new Error('Stripe price ID is not configured for this plan');
  }

  return fallback;
}

function resolvePlanFromStripePrice(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;

  const idByPlan: Array<[Exclude<PlanTier, 'freemium' | 'custom'>, string | undefined]> = [
    ['lite', process.env['STRIPE_PRICE_ID_LITE']],
    ['basic', process.env['STRIPE_PRICE_ID_BASIC']],
    ['pro', process.env['STRIPE_PRICE_ID_PRO']],
  ];

  for (const [tier, configuredPriceId] of idByPlan) {
    if (configuredPriceId && configuredPriceId === priceId) {
      return tier;
    }
  }

  const fallback = process.env['STRIPE_PRICE_ID'];
  if (fallback && fallback === priceId) {
    return 'basic';
  }

  return null;
}

function nextBillingPeriodEnd(from: Date): Date {
  return new Date(from.getTime() + BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000);
}

export async function refreshBusinessUsageCycleIfNeeded(business: Business): Promise<Business> {
  const plan = getPlanDefinition(business.planTier);
  if (plan.monthlyMessages === null) {
    return business;
  }

  const now = new Date();
  const periodEnd = business.currentPeriodEnd;
  const needsReset = !periodEnd || periodEnd <= now;
  if (!needsReset) {
    return business;
  }

  const [updated] = await getDb()
    .update(businesses)
    .set({
      creditBalance: plan.monthlyMessages,
      currentPeriodEnd: nextBillingPeriodEnd(now),
      updatedAt: sql`now()`,
    })
    .where(eq(businesses.id, business.id))
    .returning();

  return updated ?? business;
}

export async function setBusinessPlanTier(
  businessId: string,
  planTier: PlanTier,
): Promise<Business | null> {
  const plan = getPlanDefinition(planTier);
  const now = new Date();

  const [updated] = await getDb()
    .update(businesses)
    .set({
      planTier,
      creditBalance:
        plan.monthlyMessages === null
          ? businesses.creditBalance
          : sql`GREATEST(${businesses.creditBalance}, ${plan.monthlyMessages})`,
      currentPeriodEnd:
        plan.monthlyMessages === null
          ? businesses.currentPeriodEnd
          : nextBillingPeriodEnd(now),
      updatedAt: sql`now()`,
    })
    .where(eq(businesses.id, businessId))
    .returning();

  return updated ?? null;
}

// ─── Stripe client ────────────────────────────────────────────────────────────

function getStripe(): Stripe {
  const key = process.env['STRIPE_SECRET_KEY'];
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return new Stripe(key);
}

function getRazorpay(): Razorpay {
  const keyId = process.env['RAZORPAY_KEY_ID'];
  const keySecret = process.env['RAZORPAY_KEY_SECRET'];
  if (!keyId || !keySecret) {
    throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured');
  }

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// ─── Status helpers ───────────────────────────────────────────────────────────

/**
 * Returns true when the business is allowed to send messages.
 * True during an active trial or when subscribed (active / past_due grace).
 */
export function isBusinessActive(business: Business): boolean {
  const plan = getPlanDefinition(business.planTier);
  if (plan.monthlyMessages === null) {
    return true;
  }

  return business.creditBalance > 0;
}

/**
 * Detailed billing status object returned to the admin UI.
 */
export function getBillingStatus(business: Business) {
  const plan = getPlanDefinition(business.planTier);
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
    planTier: plan.tier,
    planLabel: plan.label,
    monthlyMessageLimit: plan.monthlyMessages,
    currentPeriodEnd: business.currentPeriodEnd?.toISOString() ?? null,
    messagesUsedTotal: business.messagesUsedTotal,
    creditBalance: business.creditBalance,
    signupCreditsGranted: business.signupCreditsGranted,
    creditsPurchasedTotal: business.creditsPurchasedTotal,
    creditsUsedTotal: business.creditsUsedTotal,
    includedApiCredits: plan.monthlyMessages,
    remainingApiCredits: plan.monthlyMessages === null ? null : business.creditBalance,
    hasStripeCustomer: Boolean(business.stripeCustomerId),
    planCatalog: PLAN_TIERS.map((tier) => ({
      tier,
      label: PLAN_DEFINITIONS[tier].label,
      monthlyMessages: PLAN_DEFINITIONS[tier].monthlyMessages,
      requiresSupport: PLAN_DEFINITIONS[tier].requiresSupport,
    })),
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
  returnUrl: string,
  planTier: PlanTier,
): Promise<string> {
  const priceId = getStripePriceIdForPlan(planTier);

  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(business, email);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId }],
    subscription_data: {
      metadata: { businessId: business.id, planTier },
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
export async function recordMessageUsage(business: Business, agentId?: string): Promise<void> {
  const plan = getPlanDefinition(business.planTier);
  if (plan.monthlyMessages === null) {
    await getDb()
      .update(businesses)
      .set({
        messagesUsedTotal: sql`${businesses.messagesUsedTotal} + 1`,
        creditsUsedTotal: sql`${businesses.creditsUsedTotal} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(businesses.id, business.id));
    return;
  }

  const db = getDb();
  const [updated] = await db
    .update(businesses)
    .set({
      messagesUsedTotal: sql`${businesses.messagesUsedTotal} + 1`,
      creditsUsedTotal: sql`${businesses.creditsUsedTotal} + 1`,
      creditBalance: sql`${businesses.creditBalance} - 1`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(businesses.id, business.id), gte(businesses.creditBalance, 1)))
    .returning({
      businessId: businesses.id,
      balanceAfter: businesses.creditBalance,
      creditsUsedTotal: businesses.creditsUsedTotal,
    });

  if (!updated) {
    throw new Error('Insufficient credits');
  }

  await db.insert(businessCreditLedger).values({
    businessId: updated.businessId,
    amount: -1,
    balanceAfter: updated.balanceAfter,
    reason: 'usage_debit',
    metadata: {
      source: 'recordMessageUsage',
      ...(agentId ? { agentId } : {}),
      creditsUsedTotal: updated.creditsUsedTotal,
    },
  });
}

export async function topUpBusinessCredits(input: {
  businessId: string;
  amount: number;
  createdByUserId: string;
  reason?: 'top_up' | 'manual_adjustment' | 'refund';
  referenceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ creditBalance: number; creditsPurchasedTotal: number }> {
  const db = getDb();
  const [updated] = await db
    .update(businesses)
    .set({
      creditBalance: sql`${businesses.creditBalance} + ${input.amount}`,
      creditsPurchasedTotal: sql`${businesses.creditsPurchasedTotal} + ${input.amount}`,
      updatedAt: sql`now()`,
    })
    .where(eq(businesses.id, input.businessId))
    .returning({
      creditBalance: businesses.creditBalance,
      creditsPurchasedTotal: businesses.creditsPurchasedTotal,
    });

  if (!updated) {
    throw new Error('Business not found');
  }

  await db.insert(businessCreditLedger).values({
    businessId: input.businessId,
    amount: input.amount,
    balanceAfter: updated.creditBalance,
    reason: input.reason ?? 'top_up',
    referenceId: input.referenceId,
    createdByUserId: input.createdByUserId,
    metadata: input.metadata,
  });

  return updated;
}

function getTopUpUnitAmountCents(): number {
  const raw = process.env['STRIPE_CREDIT_UNIT_AMOUNT_CENTS'];
  const parsed = Number(raw ?? 100);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error('STRIPE_CREDIT_UNIT_AMOUNT_CENTS must be a positive integer');
  }

  return parsed;
}

function getStripePaymentMethodTypes(medium: TopUpMedium): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] {
  switch (medium) {
    case 'card':
      return ['card'];
    case 'wallet':
      return ['card', 'link'];
    case 'bank_debit':
      return ['us_bank_account'];
    case 'any':
      return ['card', 'link', 'us_bank_account'];
    case 'manual':
    case 'razorpay':
      return ['card'];
    case 'wise':
      return ['us_bank_account'];
    default:
      return ['card'];
  }
}

function getRazorpayUnitAmountPaise(): number {
  const raw = process.env['RAZORPAY_CREDIT_UNIT_AMOUNT_PAISE'];
  const parsed = Number(raw ?? 100);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error('RAZORPAY_CREDIT_UNIT_AMOUNT_PAISE must be a positive integer');
  }

  return parsed;
}

export async function createTopUpCheckoutSession(input: {
  business: Business;
  email: string;
  returnUrl: string;
  credits: number;
  medium: TopUpMedium;
  initiatedByUserId: string;
}): Promise<string> {
  if (!Number.isInteger(input.credits) || input.credits <= 0) {
    throw new Error('credits must be a positive integer');
  }

  if (!TOP_UP_MEDIUMS.includes(input.medium)) {
    throw new Error('Unsupported top-up medium');
  }

  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(input.business, input.email);
  const unitAmount = getTopUpUnitAmountCents();

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_method_types: getStripePaymentMethodTypes(input.medium),
    line_items: [
      {
        price_data: {
          currency: process.env['STRIPE_CURRENCY'] ?? 'usd',
          unit_amount: unitAmount,
          product_data: {
            name: 'PNpbrain Credit Refill',
            description: `${input.credits.toLocaleString()} API credits`,
          },
        },
        quantity: input.credits,
      },
    ],
    metadata: {
      kind: 'credit_top_up',
      businessId: input.business.id,
      credits: String(input.credits),
      medium: input.medium,
      initiatedByUserId: input.initiatedByUserId,
    },
    success_url: `${input.returnUrl}?billing=topup_success`,
    cancel_url: `${input.returnUrl}?billing=topup_canceled`,
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return session.url;
}

export async function settleTopUpCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<void> {
  if (session.mode !== 'payment') return;
  if (session.payment_status !== 'paid') return;

  const kind = session.metadata?.['kind'];
  if (kind !== 'credit_top_up') return;

  const businessId = session.metadata?.['businessId'];
  const creditsRaw = session.metadata?.['credits'];
  const initiatedByUserId = session.metadata?.['initiatedByUserId'];
  const medium = session.metadata?.['medium'] ?? 'any';

  const credits = Number(creditsRaw);
  if (!businessId || !initiatedByUserId || !Number.isInteger(credits) || credits <= 0) {
    throw new Error('Invalid top-up checkout metadata');
  }

  const db = getDb();
  const existing = await db
    .select({ id: businessCreditLedger.id })
    .from(businessCreditLedger)
    .where(eq(businessCreditLedger.referenceId, session.id))
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  await topUpBusinessCredits({
    businessId,
    amount: credits,
    createdByUserId: initiatedByUserId,
    reason: 'top_up',
    referenceId: session.id,
    metadata: {
      source: 'stripe_checkout',
      medium,
      checkoutSessionId: session.id,
      paymentIntentId: session.payment_intent,
      amountSubtotal: session.amount_subtotal,
      amountTotal: session.amount_total,
      currency: session.currency,
    },
  });
}

export async function createRazorpayTopUpPaymentLink(input: {
  business: Business;
  email: string;
  returnUrl: string;
  credits: number;
  initiatedByUserId: string;
}): Promise<string> {
  if (!Number.isInteger(input.credits) || input.credits <= 0) {
    throw new Error('credits must be a positive integer');
  }

  const unitAmountPaise = getRazorpayUnitAmountPaise();
  const amountPaise = unitAmountPaise * input.credits;
  const razorpay = getRazorpay();
  const customerEmail = input.email.trim() || `${input.business.id}@pnpbrain.local`;

  const paymentLink = await razorpay.paymentLink.create({
    amount: amountPaise,
    currency: process.env['RAZORPAY_CURRENCY'] ?? 'INR',
    accept_partial: false,
    description: `PNpbrain Credit Refill (${input.credits} credits)`,
    customer: {
      name: input.business.name,
      email: customerEmail,
    },
    notify: {
      sms: false,
      email: true,
    },
    reminder_enable: false,
    callback_url: `${input.returnUrl}?billing=topup_success&provider=razorpay`,
    callback_method: 'get',
    notes: {
      kind: 'credit_top_up',
      businessId: input.business.id,
      credits: String(input.credits),
      medium: 'razorpay',
      initiatedByUserId: input.initiatedByUserId,
    },
  });

  const shortUrl = (paymentLink as { short_url?: string }).short_url;
  if (!shortUrl) {
    throw new Error('Razorpay did not return a payment URL');
  }

  return shortUrl;
}

export function verifyRazorpayWebhookSignature(payload: Buffer, signature: string): boolean {
  const secret = process.env['RAZORPAY_WEBHOOK_SECRET'];
  if (!secret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured');
  }

  const digest = createHmac('sha256', secret).update(payload).digest('hex');
  const digestBuffer = Buffer.from(digest, 'utf8');
  const signatureBuffer = Buffer.from(signature, 'utf8');

  if (digestBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(digestBuffer, signatureBuffer);
}

type RazorpayWebhookPayment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  notes?: Record<string, string | undefined>;
};

type RazorpayWebhookPayload = {
  event: string;
  payload?: {
    payment?: {
      entity?: RazorpayWebhookPayment;
    };
  };
};

export async function settleRazorpayPaymentCapture(event: RazorpayWebhookPayload): Promise<void> {
  if (event.event !== 'payment.captured') return;

  const payment = event.payload?.payment?.entity;
  if (!payment || payment.status !== 'captured') return;

  const kind = payment.notes?.['kind'];
  if (kind !== 'credit_top_up') return;

  const businessId = payment.notes?.['businessId'];
  const creditsRaw = payment.notes?.['credits'];
  const initiatedByUserId = payment.notes?.['initiatedByUserId'];
  const medium = payment.notes?.['medium'] ?? 'razorpay';

  const credits = Number(creditsRaw);
  if (!businessId || !initiatedByUserId || !Number.isInteger(credits) || credits <= 0) {
    throw new Error('Invalid Razorpay top-up metadata');
  }

  const referenceId = `razorpay:${payment.id}`;
  const db = getDb();
  const existing = await db
    .select({ id: businessCreditLedger.id })
    .from(businessCreditLedger)
    .where(eq(businessCreditLedger.referenceId, referenceId))
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  await topUpBusinessCredits({
    businessId,
    amount: credits,
    createdByUserId: initiatedByUserId,
    reason: 'top_up',
    referenceId,
    metadata: {
      source: 'razorpay_payment_link',
      medium,
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
    },
  });
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
  const planTierFromMetadata = sub.metadata['planTier'];
  const planTierFromPrice = resolvePlanFromStripePrice(item?.price?.id ?? null);
  const planTier = getPlanDefinition(planTierFromMetadata ?? planTierFromPrice ?? 'basic').tier;
  const plan = getPlanDefinition(planTier);

  await getDb()
    .update(businesses)
    .set({
      planTier,
      stripeSubscriptionId: sub.id,
      stripeSubscriptionItemId: item?.id ?? null,
      subscriptionStatus: status,
      currentPeriodEnd:
        typeof currentPeriodEnd === 'number'
          ? new Date(currentPeriodEnd * 1000)
          : null,
      creditBalance:
        plan.monthlyMessages === null
          ? businesses.creditBalance
          : sql`GREATEST(${businesses.creditBalance}, ${plan.monthlyMessages})`,
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
      planTier: 'freemium',
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
