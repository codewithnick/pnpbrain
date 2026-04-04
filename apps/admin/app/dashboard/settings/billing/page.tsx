'use client';

/**
 * Settings → Billing
 *
 * Shows the business credit wallet and lets the owner top up credits.
 */

import { useEffect, useState } from 'react';
import { fetchBackend } from '@/lib/supabase';

type PlanTier = 'freemium' | 'lite' | 'basic' | 'pro' | 'custom';

type PlanCatalogItem = {
  tier: PlanTier;
  label: string;
  monthlyMessages: number | null;
  requiresSupport: boolean;
};

type BillingStatus = {
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  isActive: boolean;
  isTrialing: boolean;
  trialExpired: boolean;
  trialEndsAt: string;
  trialDaysRemaining: number;
  planTier: PlanTier;
  planLabel: string;
  monthlyMessageLimit: number | null;
  planCatalog: PlanCatalogItem[];
  currentPeriodEnd: string | null;
  messagesUsedTotal: number;
  creditBalance: number;
  signupCreditsGranted: number;
  creditsPurchasedTotal: number;
  creditsUsedTotal: number;
  includedApiCredits: number | null;
  remainingApiCredits: number | null;
  hasStripeCustomer: boolean;
};

type TopUpMedium = 'any' | 'card' | 'wallet' | 'bank_debit' | 'razorpay' | 'wise' | 'manual';
type PlanCheckoutMethod = 'stripe' | 'razorpay' | 'wise' | 'invoice';
type BillingInstructions = {
  provider: 'razorpay' | 'wise' | 'invoice';
  title: string;
  summary: string;
  reference: string;
  supportEmail: string;
  steps: string[];
  details: Array<{ label: string; value: string }>;
  notice?: string;
};

const PLAN_CHECKOUT_OPTIONS: Array<{
  value: PlanCheckoutMethod;
  label: string;
  badge: string;
  description: string;
}> = [
  {
    value: 'stripe',
    label: 'Stripe',
    badge: 'Instant',
    description: 'Fastest self-serve card checkout for paid plans.',
  },
  {
    value: 'razorpay',
    label: 'Razorpay',
    badge: 'Assisted',
    description: 'Ideal for India-based billing while recurring setup rolls out.',
  },
  {
    value: 'wise',
    label: 'Wise',
    badge: 'Global',
    description: 'Useful for low-friction international bank payments and transfers.',
  },
  {
    value: 'invoice',
    label: 'Invoice / bank transfer',
    badge: 'Flexible',
    description: 'Ask the billing team to activate your plan via invoice or transfer.',
  },
];

const PLAN_UI_META: Record<PlanTier, { summary: string; footnote: string; badge?: string }> = {
  freemium: {
    summary: 'Good for trying PNPBRAIN with a lightweight monthly allowance.',
    footnote: 'No payment details needed. Useful for evaluation and small live pilots.',
    badge: 'Starter',
  },
  lite: {
    summary: 'For solo operators and small teams that want room to grow.',
    footnote: 'A practical upgrade when the free allowance is no longer enough.',
  },
  basic: {
    summary: 'Balanced option for active customer support and lead capture use cases.',
    footnote: 'Great fit for growing businesses that need steady monthly usage.',
    badge: 'Popular',
  },
  pro: {
    summary: 'High-capacity plan for heavier traffic and multiple production agents.',
    footnote: 'Best for businesses running larger workloads across the team.',
    badge: 'Scale',
  },
  custom: {
    summary: 'Tailored usage, onboarding, and billing for advanced or enterprise needs.',
    footnote: 'Handled directly by the billing team with flexible invoicing options.',
    badge: 'Custom',
  },
};

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [topUpActionLoading, setTopUpActionLoading] = useState(false);
  const [planActionLoading, setPlanActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [flashMessage, setFlashMessage] = useState('');
  const [billingInstructions, setBillingInstructions] = useState<BillingInstructions | null>(null);
  const [topUpCredits, setTopUpCredits] = useState('100');
  const [topUpMedium, setTopUpMedium] = useState<TopUpMedium>('any');
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>('freemium');
  const [planCheckoutMethod, setPlanCheckoutMethod] = useState<PlanCheckoutMethod>('stripe');

  let topUpActionLabel = 'Continue to checkout';
  if (topUpActionLoading) {
    topUpActionLabel = topUpMedium === 'manual' ? 'Adding…' : 'Opening…';
  } else if (topUpMedium === 'manual') {
    topUpActionLabel = 'Add usage now';
  }

  async function loadBilling() {
    const res = await fetchBackend('/api/billing/status');
    if (!res.ok) {
      setError('Failed to load billing information.');
      setLoading(false);
      return;
    }

    const json = (await res.json()) as { ok: boolean; data: BillingStatus };
    setBilling(json.data);
    setSelectedPlan(json.data.planTier);
    setLoading(false);
  }

  useEffect(() => {
    void loadBilling();
  }, []);

  useEffect(() => {
    setBillingInstructions(null);
  }, [selectedPlan, planCheckoutMethod, topUpMedium]);

  async function handleTopUp() {
    setTopUpActionLoading(true);
    setError('');
    setFlashMessage('');
    setBillingInstructions(null);
    try {
      const amount = Number(topUpCredits);
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
        setError('Enter a positive whole number of credits.');
        setTopUpActionLoading(false);
        return;
      }

      const endpoint = topUpMedium === 'manual' ? '/api/billing/top-up' : '/api/billing/top-up/checkout';
      const res = await fetchBackend(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ credits: amount, medium: topUpMedium }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        url?: string;
        message?: string;
        instructions?: BillingInstructions;
      };
      if (!res.ok) {
        setError(json.error ?? 'Failed to top up credits.');
        setTopUpActionLoading(false);
        return;
      }

      if (json.instructions) {
        setBillingInstructions(json.instructions);
        setFlashMessage(json.message ?? 'Payment instructions are ready.');
        return;
      }

      if (topUpMedium !== 'manual') {
        const checkoutUrl = json.url;
        if (!checkoutUrl) {
          setError('Checkout URL missing from billing response.');
          setTopUpActionLoading(false);
          return;
        }

        globalThis.location.href = checkoutUrl;
        return;
      }

      setFlashMessage(`${amount.toLocaleString()} credits added to this business.`);
      await loadBilling();
    } finally {
      setTopUpActionLoading(false);
    }
  }

  async function handlePlanCheckout() {
    if (!billing) return;

    setPlanActionLoading(true);
    setError('');
    setFlashMessage('');
    setBillingInstructions(null);
    try {
      if (selectedPlan === 'freemium') {
        setFlashMessage('Freemium is active by default. No checkout required.');
        setPlanActionLoading(false);
        return;
      }

      const res = await fetchBackend('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planTier: selectedPlan, paymentMethod: planCheckoutMethod }),
      });

      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        url?: string;
        message?: string;
        instructions?: BillingInstructions;
      };
      if (!res.ok) {
        setError(json.error ?? 'Failed to start plan checkout.');
        return;
      }

      if (json.instructions) {
        setBillingInstructions(json.instructions);
        setFlashMessage(json.message ?? 'Payment instructions are ready.');
        return;
      }

      if (json.url) {
        globalThis.location.href = json.url;
        return;
      }

      setFlashMessage(json.message ?? 'Billing request submitted.');
    } finally {
      setPlanActionLoading(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-400 dark:text-slate-500 py-8">Loading billing information…</div>;
  }

  if (!billing) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
        {error || 'Unable to load billing information.'}
      </div>
    );
  }

  const walletStatusLabel = billing.creditBalance > 0 ? 'Usage Available' : 'Limit Reached';
  const walletStatusColor = billing.creditBalance > 0
    ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300'
    : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300';

  const monthlyLimitLabel = billing.monthlyMessageLimit === null
    ? 'Unlimited'
    : billing.monthlyMessageLimit.toLocaleString();

  const selectedPlanSummary = billing.planCatalog.find((plan) => plan.tier === selectedPlan);
  const selectedPlanMeta = PLAN_UI_META[selectedPlan];
  const selectedPlanLabel = selectedPlanSummary?.label ?? `${selectedPlan.charAt(0).toUpperCase()}${selectedPlan.slice(1)}`;
  const selectedPlanMonthlyMessages = selectedPlanSummary?.monthlyMessages ?? null;

  const planHelpText = (() => {
    if (selectedPlan === 'freemium') return 'Start free immediately — no payment details required.';
    if (selectedPlan === 'custom') return 'Custom onboarding is handled directly by our billing team.';
    if (planCheckoutMethod === 'stripe') return 'Secure self-serve checkout with instant activation.';
    if (planCheckoutMethod === 'razorpay') return 'Choose this if you prefer a Razorpay-assisted payment path.';
    if (planCheckoutMethod === 'wise') return 'Choose Wise for international transfers and cross-border billing.';
    return 'Best if your team prefers invoicing, procurement approval, or bank transfer.';
  })();

  const planActionLabel = (() => {
    const planName = `${selectedPlan.charAt(0).toUpperCase()}${selectedPlan.slice(1)}`;
    if (planActionLoading) return planCheckoutMethod === 'invoice' ? 'Preparing…' : 'Opening…';
    if (selectedPlan === 'freemium') return 'Keep Freemium active';
    if (selectedPlan === 'custom') return 'Contact billing for Custom';
    if (planCheckoutMethod === 'invoice') return `Request invoice for ${planName}`;
    if (planCheckoutMethod === 'razorpay') return `Request ${planName} via Razorpay`;
    if (planCheckoutMethod === 'wise') return `Request ${planName} via Wise`;
    return `Checkout ${planName} with Stripe`;
  })();

  return (
    <div className="space-y-6 max-w-4xl">
      {flashMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300">
          {flashMessage}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Status card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Plan and usage wallet</h2>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${walletStatusColor}`}
          >
            {walletStatusLabel}
          </span>
        </div>

        <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 dark:bg-blue-950/30 dark:border-blue-900/50">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
            Current plan: {billing.planLabel}
          </p>
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
            Monthly included messages: {monthlyLimitLabel}. Shared across all users and all agents.
          </p>
        </div>

        {billing.creditBalance <= 0 && (
          <div className="rounded-xl bg-red-50 border border-red-100 p-4 dark:bg-red-950/30 dark:border-red-900/50">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">This business has hit its monthly usage cap.</p>
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Chat and MCP requests are blocked until you upgrade or add usage packs.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
            <p className="text-xs text-gray-500 dark:text-slate-400">Remaining this cycle</p>
            <span className="font-medium text-gray-900 dark:text-slate-100">
              {billing.creditBalance.toLocaleString()}
            </span>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
            <p className="text-xs text-gray-500 dark:text-slate-400">Usage packs purchased</p>
            <span className="font-medium text-gray-900 dark:text-slate-100">
              {billing.creditsPurchasedTotal.toLocaleString()}
            </span>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
            <p className="text-xs text-gray-500 dark:text-slate-400">Messages used</p>
            <span className="font-medium text-gray-900 dark:text-slate-100">
              {billing.creditsUsedTotal.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Usage card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-3 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Usage</h2>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-slate-400">Total AI messages processed</span>
          <span className="text-2xl font-bold text-gray-900 dark:text-slate-100">
            {billing.messagesUsedTotal.toLocaleString()}
          </span>
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500">
          Each successful AI interaction consumes one message from the active plan allowance.
        </p>
        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
            <p className="text-xs text-gray-500 dark:text-slate-400">Included monthly messages</p>
            <p className="mt-1 text-base font-semibold text-gray-900 dark:text-slate-100">
              {billing.includedApiCredits === null ? 'Unlimited' : billing.includedApiCredits.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
            <p className="text-xs text-gray-500 dark:text-slate-400">Remaining messages</p>
            <p className="mt-1 text-base font-semibold text-gray-900 dark:text-slate-100">
              {billing.remainingApiCredits === null ? 'Unlimited' : billing.remainingApiCredits.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Choose plan</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              Pick a plan first, then choose how you want to pay.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Flexible billing
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {billing.planCatalog.map((plan) => {
            const isSelected = selectedPlan === plan.tier;
            const isCurrent = billing.planTier === plan.tier;
            const meta = PLAN_UI_META[plan.tier];

            return (
              <button
                key={plan.tier}
                type="button"
                onClick={() => setSelectedPlan(plan.tier)}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-brand-500 bg-brand-50 shadow-sm dark:border-brand-500/70 dark:bg-brand-950/20'
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300 dark:border-slate-800 dark:bg-slate-800/60 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{plan.label}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{meta.summary}</p>
                  </div>
                  {meta.badge && (
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-slate-900 dark:text-slate-300">
                      {meta.badge}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <p className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                    {plan.monthlyMessages === null ? 'Unlimited' : `${plan.monthlyMessages.toLocaleString()} msgs/mo`}
                  </p>
                  <div className="flex flex-wrap justify-end gap-2 text-[10px] font-medium">
                    {isCurrent && (
                      <span className="rounded-full bg-green-100 px-2 py-1 text-green-700 dark:bg-green-950/40 dark:text-green-300">
                        Current
                      </span>
                    )}
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                      {plan.requiresSupport ? 'Support setup' : 'Self-serve'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/40">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                {selectedPlanLabel} selected
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{selectedPlanMeta.footnote}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-gray-700 dark:bg-slate-900 dark:text-slate-200">
              {selectedPlanMonthlyMessages === null
                ? 'Unlimited monthly usage'
                : `${selectedPlanMonthlyMessages.toLocaleString()} monthly messages`}
            </span>
          </div>

          {selectedPlan !== 'freemium' && (
            <div className="mt-4 space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">
                Payment option
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PLAN_CHECKOUT_OPTIONS.map((option) => {
                  const isSelected = planCheckoutMethod === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPlanCheckoutMethod(option.value)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        isSelected
                          ? 'border-brand-500 bg-white dark:border-brand-500/70 dark:bg-slate-900'
                          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{option.label}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {option.badge}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">{option.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 dark:text-slate-500">{planHelpText}</p>
        <button
          onClick={handlePlanCheckout}
          disabled={planActionLoading}
          className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-60 transition-colors"
        >
          {planActionLabel}
        </button>
      </div>

      {billingInstructions && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-6 shadow-sm space-y-4 dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-amber-900 dark:text-amber-100">{billingInstructions.title}</h3>
              <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-200/80">{billingInstructions.summary}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:bg-slate-900 dark:text-amber-300">
              {billingInstructions.provider}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {billingInstructions.details.map((detail) => (
              <div
                key={`${detail.label}-${detail.value}`}
                className="rounded-xl border border-amber-200/80 bg-white px-4 py-3 dark:border-amber-900/40 dark:bg-slate-900"
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  {detail.label}
                </p>
                <p className="mt-1 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">{detail.value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">Next steps</p>
            <ol className="space-y-2 text-sm text-amber-900 dark:text-amber-100 list-decimal pl-5">
              {billingInstructions.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl bg-white/80 px-4 py-3 text-xs text-amber-900 dark:bg-slate-900/90 dark:text-amber-100">
            <p>
              <span className="font-semibold">Reference:</span> {billingInstructions.reference}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Support:</span> {billingInstructions.supportEmail}
            </p>
            {billingInstructions.notice && <p className="mt-2">{billingInstructions.notice}</p>}
          </div>
        </div>
      )}

      {/* Pricing info */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-3 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Pricing model</h2>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-slate-300">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>Freemium, Lite, Basic, Pro, and Custom plans are available with Stripe, Wise, invoice, and assisted payment paths</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>Monthly message allowances are shared across the business</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>Each agent can have its own config, tools, integrations, and knowledge base</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>Optional usage packs are available for rare spikes</span>
          </li>
        </ul>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Add usage pack</h2>
        <div className="space-y-2">
          <label htmlFor="top-up-medium" className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Refill medium
          </label>
          <select
            id="top-up-medium"
            value={topUpMedium}
            onChange={(event) => setTopUpMedium(event.target.value as TopUpMedium)}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="any">Any supported medium (recommended)</option>
            <option value="card">Card only</option>
            <option value="wallet">Wallet / Link</option>
            <option value="bank_debit">Bank debit (ACH)</option>
            <option value="razorpay">Razorpay</option>
            <option value="wise">Wise transfer</option>
            <option value="manual">Manual direct credit refill</option>
          </select>
        </div>
        <div className="flex gap-3">
          <input
            id="top-up-credits"
            type="number"
            min={1}
            step={1}
            value={topUpCredits}
            onChange={(event) => setTopUpCredits(event.target.value)}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Messages to add"
          />
          <button
            onClick={handleTopUp}
            disabled={topUpActionLoading}
            className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {topUpActionLabel}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500">
          Manual refill applies usage instantly. Online mediums open the best available provider flow, including Stripe, Razorpay, and Wise.
        </p>
      </div>
    </div>
  );
}
