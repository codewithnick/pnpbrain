/**
 * POST /api/billing/webhook
 *
 * Stripe webhook endpoint — keeps our DB in sync with subscription events.
 *
 * Handled events:
 *   customer.subscription.created  → activate subscription
 *   customer.subscription.updated  → sync status / period
 *   customer.subscription.deleted  → mark as canceled
 *   invoice.payment_failed         → mark as past_due
 *
 * Setup:
 *   1. Set STRIPE_WEBHOOK_SECRET to the signing secret from your Stripe dashboard.
 *   2. Register this URL in Stripe: https://<your-backend>/api/billing/webhook
 *   3. Select the four event types above.
 *
 * Security: requests are verified via Stripe's HMAC signature.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { constructWebhookEvent, syncStripeSubscription, cancelSubscription } from '@/lib/billing';
import { getDb } from '@pnpbrain/db/client';
import { businesses } from '@pnpbrain/db/schema';
import { eq, sql } from 'drizzle-orm';

export const runtime = 'nodejs';

// Stripe sends the raw body — we must NOT parse it as JSON before verifying.
export const config = { api: { bodyParser: false } };

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const raw = (invoice as unknown as {
    subscription?: string | { id?: string } | null;
  }).subscription;

  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && typeof raw.id === 'string') return raw.id;
  return null;
}

export async function POST(req: NextRequest) {
  const secret = process.env['STRIPE_WEBHOOK_SECRET'];
  if (!secret) {
    console.error('[billing/webhook] STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ ok: false, error: 'Server misconfiguration' }, { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ ok: false, error: 'Missing Stripe signature' }, { status: 400 });
  }

  // Read raw body bytes for signature verification
  const rawBody = await req.arrayBuffer();
  const payload = Buffer.from(rawBody);

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(payload, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[billing/webhook] Signature verification failed:', message);
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await syncStripeSubscription(sub);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await cancelSubscription(sub);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = getInvoiceSubscriptionId(invoice);

        if (subId) {
          await getDb()
            .update(businesses)
            .set({ subscriptionStatus: 'past_due', updatedAt: sql`now()` })
            .where(eq(businesses.stripeSubscriptionId, subId));
        }
        break;
      }

      default:
        // Unhandled event types — acknowledge receipt without processing
        break;
    }
  } catch (err) {
    console.error(`[billing/webhook] Error handling ${event.type}:`, err);
    // Return 200 so Stripe doesn't retry (our error is likely non-recoverable)
  }

  return NextResponse.json({ ok: true, received: true });
}
