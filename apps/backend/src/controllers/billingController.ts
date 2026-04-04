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

const PLAN_CHECKOUT_METHODS = ['stripe', 'razorpay', 'wise', 'invoice'] as const;
type PlanCheckoutMethod = (typeof PLAN_CHECKOUT_METHODS)[number];
type AssistedPaymentMethod = Exclude<PlanCheckoutMethod, 'stripe'>;

type BillingInstructions = {
  provider: AssistedPaymentMethod;
  title: string;
  summary: string;
  reference: string;
  supportEmail: string;
  steps: string[];
  details: Array<{ label: string; value: string }>;
  notice?: string;
};

export class BillingController {
  private readonly getSupportEmail = () => process.env['BILLING_SUPPORT_EMAIL'] ?? 'support@pnpbrain.com';

  private readonly buildAssistedCheckoutUrl = (
    businessName: string,
    planTier: PlanTier,
    paymentMethod: AssistedPaymentMethod
  ) => {
    const planLabel = `${planTier.charAt(0).toUpperCase()}${planTier.slice(1)}`;
    const paymentLabel = paymentMethod === 'razorpay'
      ? 'Razorpay'
      : paymentMethod === 'wise'
        ? 'Wise'
        : 'invoice / bank transfer';
    const supportEmail = this.getSupportEmail();
    const subject = encodeURIComponent(`PNPBRAIN ${planLabel} plan via ${paymentLabel}`);
    const body = encodeURIComponent(
      [
        `Business: ${businessName}`,
        `Requested plan: ${planLabel}`,
        `Preferred payment method: ${paymentLabel}`,
        '',
        'Please help us complete the upgrade.',
      ].join('\n')
    );

    return `mailto:${supportEmail}?subject=${subject}&body=${body}`;
  };

  private readonly buildBankTransferInstructions = (input: {
    businessName: string;
    paymentMethod: AssistedPaymentMethod;
    planTier?: PlanTier;
    credits?: number;
  }): BillingInstructions => {
    const supportEmail = this.getSupportEmail();
    const wiseRecipient = process.env['WISE_RECIPIENT_NAME'] ?? 'PNPBRAIN Billing';
    const wiseEmail = process.env['WISE_EMAIL'] ?? supportEmail;
    const wiseCurrency = process.env['WISE_CURRENCY'] ?? 'USD';
    const wiseBankName = process.env['WISE_BANK_NAME'] ?? '';
    const wiseIban = process.env['WISE_IBAN'] ?? '';
    const wiseSwift = process.env['WISE_SWIFT_BIC'] ?? '';
    const wiseAccountNumber = process.env['WISE_ACCOUNT_NUMBER'] ?? '';
    const wiseRoutingNumber = process.env['WISE_ROUTING_NUMBER'] ?? '';
    const planLabel = input.planTier ? `${input.planTier.charAt(0).toUpperCase()}${input.planTier.slice(1)}` : null;
    const referenceBase = [
      'PNPBRAIN',
      input.paymentMethod.toUpperCase(),
      planLabel?.toUpperCase() ?? 'TOPUP',
      input.businessName.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 18),
    ].filter(Boolean);
    const reference = referenceBase.join('-');

    if (input.paymentMethod === 'wise') {
      const details = [
        { label: 'Recipient', value: wiseRecipient },
        { label: 'Wise email', value: wiseEmail },
        { label: 'Currency', value: wiseCurrency },
        { label: 'Reference', value: reference },
        { label: 'Bank name', value: wiseBankName },
        { label: 'IBAN', value: wiseIban },
        { label: 'SWIFT / BIC', value: wiseSwift },
        { label: 'Account number', value: wiseAccountNumber },
        { label: 'Routing number', value: wiseRoutingNumber },
      ].filter((detail) => detail.value.trim().length > 0);

      const notice = details.length <= 4
        ? `Wise account details are not fully configured yet. Contact ${supportEmail} and include the reference above.`
        : null;

      return {
        provider: 'wise',
        title: input.planTier ? `Pay for ${planLabel} with Wise` : 'Pay with Wise',
        summary: input.planTier
          ? `Use Wise to complete the ${planLabel} upgrade for ${input.businessName}.`
          : `Use Wise to add ${input.credits?.toLocaleString() ?? 0} credits to ${input.businessName}.`,
        reference,
        supportEmail,
        steps: [
          'Open Wise and start a transfer using the billing details below.',
          'Include the payment reference exactly as shown so the transfer is matched quickly.',
          `After sending the transfer, email the confirmation to ${supportEmail}.`,
          'Once the payment is confirmed, PNPBRAIN billing will activate the plan or credit pack.',
        ],
        details,
        ...(notice ? { notice } : {}),
      };
    }

    return {
      provider: input.paymentMethod === 'razorpay' ? 'razorpay' : 'invoice',
      title: input.planTier ? `Request ${planLabel} via ${input.paymentMethod === 'razorpay' ? 'Razorpay' : 'invoice'}` : 'Request manual billing',
      summary: input.planTier
        ? `The billing team will help you complete the ${planLabel} upgrade.`
        : `The billing team will help you complete this ${input.credits?.toLocaleString() ?? 0}-credit refill.`,
      reference,
      supportEmail,
      steps: [
        `Email ${supportEmail} with your requested ${input.planTier ? `${planLabel} plan` : 'top-up'} and reference code.`,
        input.paymentMethod === 'razorpay'
          ? 'The billing team will reply with the Razorpay payment link.'
          : 'The billing team will reply with invoice or bank transfer instructions.',
        'Once payment is confirmed, the plan or credits will be activated.',
      ],
      details: [
        { label: 'Support email', value: supportEmail },
        { label: 'Reference', value: reference },
        { label: 'Requested item', value: input.planTier ? `${planLabel} plan` : `${input.credits?.toLocaleString() ?? 0} credits` },
      ],
    };
  };

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

    const paymentMethodRaw = String(req.body?.['paymentMethod'] ?? 'stripe').toLowerCase();
    if (!PLAN_CHECKOUT_METHODS.includes(paymentMethodRaw as PlanCheckoutMethod)) {
      return res.status(400).json({ ok: false, error: 'Unsupported payment method' });
    }

    const requestedPlan = requestedPlanRaw as PlanTier;
    const paymentMethod = paymentMethodRaw as PlanCheckoutMethod;
    if (requestedPlan === 'freemium') {
      const updatedBusiness = await setBusinessPlanTier(auth.businessId, 'freemium');
      if (!updatedBusiness) {
        return res.status(404).json({ ok: false, error: 'Business not found' });
      }

      return res.json({ ok: true, mode: 'direct', data: getBillingStatus(updatedBusiness) });
    }
    if (requestedPlan === 'custom' || paymentMethod !== 'stripe') {
      const assistedMethod = requestedPlan === 'custom' && paymentMethod === 'stripe' ? 'invoice' : paymentMethod;

      if (assistedMethod === 'wise' || assistedMethod === 'invoice') {
        const instructions = this.buildBankTransferInstructions({
          businessName: business.name,
          planTier: requestedPlan,
          paymentMethod: assistedMethod,
        });

        return res.json({
          ok: true,
          mode: 'instructions',
          provider: assistedMethod,
          message:
            assistedMethod === 'wise'
              ? `Use the Wise transfer details below to complete the ${requestedPlan} upgrade.`
              : requestedPlan === 'custom'
                ? 'Custom plans are arranged by our billing team.'
                : 'Invoice and bank transfer instructions are ready below.',
          instructions,
        });
      }

      const assistedUrl = this.buildAssistedCheckoutUrl(
        business.name,
        requestedPlan,
        assistedMethod as AssistedPaymentMethod
      );

      return res.json({
        ok: true,
        mode: 'assisted',
        provider: assistedMethod,
        url: assistedUrl,
        message:
          requestedPlan === 'custom'
            ? 'Custom plans are arranged by our billing team.'
            : `We will help you complete the ${requestedPlan} upgrade via ${assistedMethod}.`,
      });
    }

    const adminUrl = process.env['NEXT_PUBLIC_ADMIN_URL'] ?? 'http://localhost:3012';
    const returnUrl = `${adminUrl}/dashboard/settings/billing`;

    try {
      const url = await createCheckoutSession(business, user?.email ?? '', returnUrl, requestedPlan);
      return res.json({ ok: true, mode: 'checkout', provider: 'stripe', url });
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

      if (mediumRaw === 'wise') {
        const instructions = this.buildBankTransferInstructions({
          businessName: business.name,
          paymentMethod: 'wise',
          credits,
        });

        return res.status(201).json({
          ok: true,
          mode: 'instructions',
          provider: 'wise',
          message: 'Use the Wise transfer details below to complete this top-up.',
          instructions,
        });
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
