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

type TopUpMedium = 'any' | 'card' | 'wallet' | 'bank_debit' | 'razorpay' | 'manual';

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [flashMessage, setFlashMessage] = useState('');
  const [topUpCredits, setTopUpCredits] = useState('100');
  const [topUpMedium, setTopUpMedium] = useState<TopUpMedium>('any');
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>('freemium');

  let topUpActionLabel = 'Continue to checkout';
  if (actionLoading) {
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

  async function handleTopUp() {
    setActionLoading(true);
    setError('');
    try {
      const amount = Number(topUpCredits);
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
        setError('Enter a positive whole number of credits.');
        setActionLoading(false);
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
      const json = (await res.json()) as { ok: boolean; error?: string; url?: string };
      if (!res.ok) {
        setError(json.error ?? 'Failed to top up credits.');
        setActionLoading(false);
        return;
      }

      if (topUpMedium !== 'manual') {
        const checkoutUrl = json.url;
        if (!checkoutUrl) {
          setError('Checkout URL missing from billing response.');
          setActionLoading(false);
          return;
        }

        globalThis.location.href = checkoutUrl;
        return;
      }

      setFlashMessage(`${amount.toLocaleString()} credits added to this business.`);
      await loadBilling();
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePlanCheckout() {
    if (!billing) return;

    setActionLoading(true);
    setError('');
    try {
      if (selectedPlan === 'freemium') {
        setFlashMessage('Freemium is active by default. No checkout required.');
        setActionLoading(false);
        return;
      }

      if (selectedPlan === 'custom') {
        globalThis.location.href = 'mailto:support@pnpbrain.com?subject=Custom%20Plan%20Setup';
        return;
      }

      const res = await fetchBackend('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planTier: selectedPlan }),
      });

      const json = (await res.json()) as { ok: boolean; error?: string; url?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? 'Failed to start plan checkout.');
        return;
      }

      globalThis.location.href = json.url;
    } finally {
      setActionLoading(false);
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

  const planHelpText = (() => {
    if (selectedPlan === 'freemium') return 'Freemium is self-serve and activated automatically.';
    if (selectedPlan === 'custom') return 'Custom plans are provisioned by support.';
    return 'Paid plans are activated through secure checkout.';
  })();

  const planActionLabel = (() => {
    if (actionLoading) return 'Opening…';
    if (selectedPlan === 'freemium') return 'Activate Freemium';
    if (selectedPlan === 'custom') return 'Contact support for Custom';
    return `Checkout ${selectedPlan.charAt(0).toUpperCase()}${selectedPlan.slice(1)}`;
  })();

  return (
    <div className="space-y-6 max-w-xl">
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
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Choose plan</h2>
        <div className="space-y-2">
          <label htmlFor="plan-tier-select" className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Available plans
          </label>
          <select
            id="plan-tier-select"
            value={selectedPlan}
            onChange={(event) => setSelectedPlan(event.target.value as PlanTier)}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            {billing.planCatalog.map((plan) => (
              <option key={plan.tier} value={plan.tier}>
                {plan.label} - {plan.monthlyMessages === null ? 'Unlimited messages' : `${plan.monthlyMessages.toLocaleString()} messages/month`}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500">{planHelpText}</p>
        <button
          onClick={handlePlanCheckout}
          disabled={actionLoading}
          className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-60 transition-colors"
        >
          {planActionLabel}
        </button>
      </div>

      {/* Pricing info */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-3 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Pricing model</h2>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-slate-300">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>Freemium, Lite, Basic, Pro, and Custom plans are available</span>
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
            disabled={actionLoading}
            className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {topUpActionLabel}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500">
          Manual refill applies usage instantly. Online mediums create a secure Stripe checkout and add usage after payment succeeds.
        </p>
      </div>
    </div>
  );
}
