import { Request, Response } from 'express';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@pnpbrain/db/client';
import { businesses } from '@pnpbrain/db/schema';
import { requireBusinessAuth } from '../middleware/auth';
import { getBusinessById } from '../lib/business';
import {
  cancelSubscription,
  constructWebhookEvent,
  createCheckoutSession,
  createPortalSession,
  createRazorpayTopUpPaymentLink,
  createTopUpCheckoutSession,
  getBillingStatus,
  verifyRazorpayWebhookSignature,
  settleRazorpayPaymentCapture,
  TOP_UP_MEDIUMS,
  type TopUpMedium,
  settleTopUpCheckoutSession,
  syncStripeSubscription,
  topUpBusinessCredits,
  PLAN_TIERS,
  type PlanTier,
  refreshBusinessUsageCycleIfNeeded,
  setBusinessPlanTier,
} from '../lib/billing';

export class BillingController {
  public readonly getStatus = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'viewer');
    if (!auth) return;

    const business = await getBusinessById(auth.businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Business not found' });
    const refreshed = await refreshBusinessUsageCycleIfNeeded(business);
    return res.json({ ok: true, data: getBillingStatus(refreshed) });
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

    const requestedPlanRaw = String(req.body?.['planTier'] ?? 'basic').toLowerCase();
    if (!PLAN_TIERS.includes(requestedPlanRaw as PlanTier)) {
      return res.status(400).json({ ok: false, error: 'Unsupported plan tier' });
    }

    const requestedPlan = requestedPlanRaw as PlanTier;
    if (requestedPlan === 'freemium') {
      const updatedBusiness = await setBusinessPlanTier(auth.businessId, 'freemium');
      if (!updatedBusiness) {
        return res.status(404).json({ ok: false, error: 'Business not found' });
      }

      return res.json({ ok: true, mode: 'direct', data: getBillingStatus(updatedBusiness) });
    }
    if (requestedPlan === 'custom') {
      return res.status(400).json({ ok: false, error: 'Custom plan requires support-assisted onboarding' });
    }

    const adminUrl = process.env['NEXT_PUBLIC_ADMIN_URL'] ?? 'http://localhost:3012';
    const returnUrl = `${adminUrl}/dashboard/settings/billing`;

    try {
      const url = await createCheckoutSession(business, user?.email ?? '', returnUrl, requestedPlan);
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

  public readonly topUpCheckout = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'owner');
    if (!auth) return;

    const credits = Number(req.body?.['credits']);
    if (!Number.isFinite(credits) || credits <= 0 || !Number.isInteger(credits)) {
      return res.status(400).json({ ok: false, error: 'credits must be a positive integer' });
    }

    const mediumRaw = String(req.body?.['medium'] ?? 'any') as TopUpMedium;
    if (!TOP_UP_MEDIUMS.includes(mediumRaw)) {
      return res.status(400).json({ ok: false, error: 'Unsupported top-up medium' });
    }

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
      if (mediumRaw === 'razorpay') {
        const url = await createRazorpayTopUpPaymentLink({
          business,
          email: user?.email ?? '',
          returnUrl,
          credits,
          initiatedByUserId: auth.userId,
        });

        return res.status(201).json({ ok: true, url });
      }

      const url = await createTopUpCheckoutSession({
        business,
        email: user?.email ?? '',
        returnUrl,
        credits,
        medium: mediumRaw,
        initiatedByUserId: auth.userId,
      });

      return res.status(201).json({ ok: true, url });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[billing/top-up-checkout]', message);
      return res.status(500).json({ ok: false, error: 'Failed to create top-up checkout session' });
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
      } else if (event.type === 'checkout.session.completed') {
        await settleTopUpCheckoutSession(event.data.object as Stripe.Checkout.Session);
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

  public readonly razorpayWebhook = async (req: Request, res: Response) => {
    const signature = req.header('x-razorpay-signature');
    if (!signature) {
      return res.status(400).json({ ok: false, error: 'Missing x-razorpay-signature header' });
    }

    const payloadBuffer = req.body as Buffer;
    let parsedPayload: unknown;
    try {
      const verified = verifyRazorpayWebhookSignature(payloadBuffer, signature);
      if (!verified) {
        return res.status(401).json({ ok: false, error: 'Webhook verification failed' });
      }

      parsedPayload = JSON.parse(payloadBuffer.toString('utf8'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[billing/razorpay-webhook] Verification failed:', message);
      return res.status(401).json({ ok: false, error: 'Webhook verification failed' });
    }

    try {
      await settleRazorpayPaymentCapture(parsedPayload as {
        event: string;
        payload?: {
          payment?: {
            entity?: {
              id: string;
              amount: number;
              currency: string;
              status: string;
              notes?: Record<string, string | undefined>;
            };
          };
        };
      });
      return res.json({ ok: true, received: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[billing/razorpay-webhook] Processing failed:', message);
      return res.status(500).json({ ok: false, error: 'Processing failed' });
    }
  };
}
