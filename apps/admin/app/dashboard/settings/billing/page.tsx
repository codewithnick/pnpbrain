'use client';

/**
 * Settings → Billing
 *
 * Shows the business credit wallet and lets the owner top up credits.
 */

import { useEffect, useState } from 'react';
import { fetchBackend } from '@/lib/supabase';

type BillingStatus = {
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  isActive: boolean;
  isTrialing: boolean;
  trialExpired: boolean;
  trialEndsAt: string;
  trialDaysRemaining: number;
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

  async function loadBilling() {
    const res = await fetchBackend('/api/billing/status');
    if (!res.ok) {
      setError('Failed to load billing information.');
      setLoading(false);
      return;
    }

    const json = (await res.json()) as { ok: boolean; data: BillingStatus };
    setBilling(json.data);
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

        window.location.href = checkoutUrl;
        return;
      }

      setFlashMessage(`${amount.toLocaleString()} credits added to this business.`);
      await loadBilling();
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

  const walletStatusLabel = billing.creditBalance > 0 ? 'Credits Available' : 'Out of Credits';
  const walletStatusColor = billing.creditBalance > 0
    ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300'
    : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300';

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
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Credit wallet</h2>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${walletStatusColor}`}
          >
            {walletStatusLabel}
          </span>
        </div>

        <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 dark:bg-blue-950/30 dark:border-blue-900/50">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
            Every new business starts with {billing.signupCreditsGranted.toLocaleString()} free credits.
          </p>
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
            Credits are shared across all users and all agents inside this business.
          </p>
        </div>

        {billing.creditBalance <= 0 && (
          <div className="rounded-xl bg-red-50 border border-red-100 p-4 dark:bg-red-950/30 dark:border-red-900/50">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">This business is out of credits.</p>
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Chat and MCP requests are blocked until credits are topped up.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
            <p className="text-xs text-gray-500 dark:text-slate-400">Current balance</p>
            <span className="font-medium text-gray-900 dark:text-slate-100">
              {billing.creditBalance.toLocaleString()}
            </span>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
            <p className="text-xs text-gray-500 dark:text-slate-400">Purchased credits</p>
            <span className="font-medium text-gray-900 dark:text-slate-100">
              {billing.creditsPurchasedTotal.toLocaleString()}
            </span>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
            <p className="text-xs text-gray-500 dark:text-slate-400">Credits used</p>
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
          Each successful AI interaction debits business credits at the organization level.
        </p>
        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
            <p className="text-xs text-gray-500 dark:text-slate-400">Included API credits</p>
            <p className="mt-1 text-base font-semibold text-gray-900 dark:text-slate-100">
              {billing.includedApiCredits === null ? 'Unlimited' : billing.includedApiCredits.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
            <p className="text-xs text-gray-500 dark:text-slate-400">Remaining API credits</p>
            <p className="mt-1 text-base font-semibold text-gray-900 dark:text-slate-100">
              {billing.remainingApiCredits === null ? 'Unlimited' : billing.remainingApiCredits.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Pricing info */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-3 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Credit model</h2>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-slate-300">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>{billing.signupCreditsGranted.toLocaleString()} free credits on signup</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>Credits are shared across the business, not per user or per agent</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>Each agent can have its own config, tools, integrations, and knowledge base</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>Top up credits whenever the organization balance gets low</span>
          </li>
        </ul>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Top up credits</h2>
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Refill medium
          </label>
          <select
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
            type="number"
            min={1}
            step={1}
            value={topUpCredits}
            onChange={(event) => setTopUpCredits(event.target.value)}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Credits to add"
          />
          <button
            onClick={handleTopUp}
            disabled={actionLoading}
            className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {actionLoading
              ? topUpMedium === 'manual'
                ? 'Adding…'
                : 'Opening…'
              : topUpMedium === 'manual'
                ? 'Add credits now'
                : 'Continue to checkout'}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500">
          Manual refill applies credits instantly. Online mediums create a secure Stripe checkout and add credits after payment succeeds.
        </p>
      </div>
    </div>
  );
}
