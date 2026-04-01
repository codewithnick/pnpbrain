import { Request, Response } from 'express';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@gcfis/db/client';
import { businesses } from '@gcfis/db/schema';
import { requireBusinessAuth } from '../middleware/auth';
import { getBusinessById } from '../lib/business';
import {
  cancelSubscription,
  constructWebhookEvent,
  createCheckoutSession,
  createPortalSession,
  getBillingStatus,
  syncStripeSubscription,
  topUpBusinessCredits,
} from '../lib/billing';

export class BillingController {
  public readonly getStatus = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'viewer');
    if (!auth) return;

    const business = await getBusinessById(auth.businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Business not found' });
    return res.json({ ok: true, data: getBillingStatus(business) });
  };

  public readonly checkout = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'owner');
    if (!auth) return;

    const business = await getBusinessById(auth.businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Business not found' });
    const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
    const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY'];
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ ok: false, error: 'Supabase env vars missing' });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const {
      data: { user },
    } = await supabase.auth.admin.getUserById(auth.userId);

    const adminUrl = process.env['NEXT_PUBLIC_ADMIN_URL'] ?? 'http://localhost:3012';
    const returnUrl = `${adminUrl}/dashboard/settings/billing`;

    try {
      const url = await createCheckoutSession(business, user?.email ?? '', returnUrl);
      return res.json({ ok: true, url });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[billing/checkout]', message);
      return res.status(500).json({ ok: false, error: 'Failed to create checkout session' });
    }
  };

  public readonly topUp = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'owner');
    if (!auth) return;

    const credits = Number(req.body?.['credits']);
    if (!Number.isFinite(credits) || credits <= 0 || !Number.isInteger(credits)) {
      return res.status(400).json({ ok: false, error: 'credits must be a positive integer' });
    }

    try {
      const data = await topUpBusinessCredits({
        businessId: auth.businessId,
        amount: credits,
        createdByUserId: auth.userId,
        metadata: {
          source: 'manual_top_up',
        },
      });

      return res.status(201).json({ ok: true, data });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[billing/top-up]', message);
      return res.status(500).json({ ok: false, error: 'Failed to top up credits' });
    }
  };

  public readonly portal = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'owner');
    if (!auth) return;

    const business = await getBusinessById(auth.businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Business not found' });
    if (!business.stripeCustomerId) {
      return res.status(400).json({ ok: false, error: 'No active subscription found. Please subscribe first.' });
    }

    const adminUrl = process.env['NEXT_PUBLIC_ADMIN_URL'] ?? 'http://localhost:3012';
    const returnUrl = `${adminUrl}/dashboard/settings/billing`;

    try {
      const url = await createPortalSession(business, returnUrl);
      return res.json({ ok: true, url });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[billing/portal]', message);
      return res.status(500).json({ ok: false, error: 'Failed to create portal session' });
    }
  };

  public readonly webhook = async (req: Request, res: Response) => {
    const secret = process.env['STRIPE_WEBHOOK_SECRET'];
    if (!secret) {
      return res.status(500).json({ ok: false, error: 'Server misconfiguration' });
    }

    const signature = req.header('stripe-signature');
    if (!signature) {
      return res.status(400).json({ ok: false, error: 'Missing signature header' });
    }

    let event: Stripe.Event;
    try {
      const body = req.body as Buffer;
      event = constructWebhookEvent(body, signature, secret);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[billing/webhook] Verification failed:', message);
      return res.status(401).json({ ok: false, error: 'Webhook verification failed' });
    }

    try {
      if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
        await syncStripeSubscription(event.data.object as Stripe.Subscription);
      } else if (event.type === 'customer.subscription.deleted') {
        await cancelSubscription(event.data.object as Stripe.Subscription);
      } else if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object as Stripe.Invoice;
        const rawSub = (invoice as unknown as { subscription?: string | { id?: string } | null }).subscription;
        const subscriptionId = typeof rawSub === 'string'
          ? rawSub
          : rawSub && typeof rawSub === 'object' && typeof rawSub.id === 'string'
            ? rawSub.id
            : null;

        if (subscriptionId) {
          const stripeKey = process.env['STRIPE_SECRET_KEY'];
          if (stripeKey) {
            const stripe = new Stripe(stripeKey);
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            const businessId = sub.metadata['businessId'];

            if (businessId) {
              await getDb()
                .update(businesses)
                .set({ subscriptionStatus: 'past_due', updatedAt: sql`now()` })
                .where(eq(businesses.id, businessId));
            }
          }
        }
      }

      return res.json({ ok: true, received: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[billing/webhook] Processing failed:', message);
      return res.status(500).json({ ok: false, error: 'Processing failed' });
    }
  };
}
