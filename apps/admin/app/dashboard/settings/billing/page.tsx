'use client';

/**
 * Settings → Billing
 *
 * Shows the current subscription/trial status and lets the owner
 * subscribe (Stripe Checkout) or manage an existing subscription
 * (Stripe Billing Portal).
 */

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? ''
  );
}

async function getToken(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? '';
}

type BillingStatus = {
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  isActive: boolean;
  isTrialing: boolean;
  trialExpired: boolean;
  trialEndsAt: string;
  trialDaysRemaining: number;
  currentPeriodEnd: string | null;
  messagesUsedTotal: number;
  hasStripeCustomer: boolean;
};

const STATUS_LABELS: Record<BillingStatus['status'], string> = {
  trialing: 'Free Trial',
  active: 'Active',
  past_due: 'Past Due',
  canceled: 'Canceled',
};

const STATUS_COLORS: Record<BillingStatus['status'], string> = {
  trialing: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  past_due: 'bg-amber-100 text-amber-700',
  canceled: 'bg-red-100 text-red-700',
};

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [flashMessage, setFlashMessage] = useState('');

  const base = process.env['NEXT_PUBLIC_BACKEND_URL'] ?? '';

  useEffect(() => {
    // Handle return from Stripe Checkout / Portal
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') === 'success') {
      setFlashMessage('Subscription activated! Welcome aboard.');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('billing') === 'canceled') {
      setFlashMessage('Checkout canceled — no changes were made.');
      window.history.replaceState({}, '', window.location.pathname);
    }

    (async () => {
      const token = await getToken();
      const res = await fetch(`${base}/api/billing/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError('Failed to load billing information.');
        setLoading(false);
        return;
      }
      const json = (await res.json()) as { ok: boolean; data: BillingStatus };
      setBilling(json.data);
      setLoading(false);
    })();
  }, [base]);

  async function handleSubscribe() {
    setActionLoading(true);
    setError('');
    const token = await getToken();
    const res = await fetch(`${base}/api/billing/checkout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { ok: boolean; url?: string; error?: string };
    if (!res.ok || !json.url) {
      setError(json.error ?? 'Failed to start checkout. Please try again.');
      setActionLoading(false);
      return;
    }
    window.location.href = json.url;
  }

  async function handleManageBilling() {
    setActionLoading(true);
    setError('');
    const token = await getToken();
    const res = await fetch(`${base}/api/billing/portal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { ok: boolean; url?: string; error?: string };
    if (!res.ok || !json.url) {
      setError(json.error ?? 'Failed to open billing portal. Please try again.');
      setActionLoading(false);
      return;
    }
    window.location.href = json.url;
  }

  if (loading) {
    return <div className="text-sm text-gray-400 py-8">Loading billing information…</div>;
  }

  if (!billing) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error || 'Unable to load billing information.'}
      </div>
    );
  }

  const showSubscribeCta =
    billing.status === 'trialing' || billing.status === 'canceled';
  const showManageCta =
    billing.hasStripeCustomer &&
    (billing.status === 'active' || billing.status === 'past_due');

  return (
    <div className="space-y-6 max-w-xl">
      {flashMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {flashMessage}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Status card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Subscription</h2>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[billing.status]}`}
          >
            {STATUS_LABELS[billing.status]}
          </span>
        </div>

        {/* Trial info */}
        {billing.isTrialing && !billing.trialExpired && (
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
            <p className="text-sm font-medium text-blue-800">
              {billing.trialDaysRemaining === 0
                ? 'Your trial expires today.'
                : `${billing.trialDaysRemaining} day${billing.trialDaysRemaining !== 1 ? 's' : ''} remaining in your free trial.`}
            </p>
            <p className="mt-1 text-xs text-blue-600">
              Trial ends on{' '}
              {new Date(billing.trialEndsAt).toLocaleDateString(undefined, {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
              . Subscribe before then to keep uninterrupted service.
            </p>
          </div>
        )}

        {/* Expired trial warning */}
        {billing.trialExpired && (
          <div className="rounded-xl bg-red-50 border border-red-100 p-4">
            <p className="text-sm font-medium text-red-800">Your free trial has ended.</p>
            <p className="mt-1 text-xs text-red-600">
              Chat messages are blocked until you subscribe. Subscribe below to restore access.
            </p>
          </div>
        )}

        {/* Past due warning */}
        {billing.status === 'past_due' && (
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
            <p className="text-sm font-medium text-amber-800">Payment failed.</p>
            <p className="mt-1 text-xs text-amber-600">
              Your last invoice could not be collected. Update your payment method to avoid service
              interruption.
            </p>
          </div>
        )}

        {/* Next billing date */}
        {billing.currentPeriodEnd && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Next billing date</span>
            <span className="font-medium text-gray-900">
              {new Date(billing.currentPeriodEnd).toLocaleDateString(undefined, {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        )}
      </div>

      {/* Usage card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Usage</h2>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Total AI messages processed</span>
          <span className="text-2xl font-bold text-gray-900">
            {billing.messagesUsedTotal.toLocaleString()}
          </span>
        </div>
        <p className="text-xs text-gray-400">
          You are billed per message on the pay-as-you-go plan.
        </p>
      </div>

      {/* Pricing info */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Pay-as-you-go pricing</h2>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>7-day free trial — no credit card required to start</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>Pay only for messages sent — no monthly base fee</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>All features included: knowledge base, Firecrawl, memory</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>Cancel anytime from the billing portal</span>
          </li>
        </ul>
      </div>

      {/* CTA buttons */}
      {showSubscribeCta && (
        <button
          onClick={handleSubscribe}
          disabled={actionLoading}
          className="w-full rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-60 transition-colors"
        >
          {actionLoading ? 'Redirecting to checkout…' : 'Subscribe — Pay as you go'}
        </button>
      )}

      {showManageCta && (
        <button
          onClick={handleManageBilling}
          disabled={actionLoading}
          className="w-full rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60 transition-colors"
        >
          {actionLoading ? 'Opening portal…' : 'Manage billing & invoices'}
        </button>
      )}
    </div>
  );
}
