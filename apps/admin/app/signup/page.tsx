'use client';

/**
 * Signup page — creates a Supabase Auth account, then provisions a business.
 * Step flow:
 *   1. Account details (email + password)  → Supabase signUp
 *   2. Business details (name + slug)      → POST /api/auth/register
 *   3. Redirect → /onboarding
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { logAuthError, logAuthInfo, logAuthWarn, maskEmail } from '@/lib/auth-debug';
import { buildAdminUrl } from '@/lib/public-url';
import { fetchBackend, getSupabaseBrowserClient, persistAccessTokenCookie } from '@/lib/supabase';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

export default function SignupPage() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Step 1 fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 2 fields
  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [accessToken, setAccessToken] = useState('');

  /* ── Step 1: create Supabase account ────────────────────────────────────── */

  async function handleAccountSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const safeEmail = maskEmail(email);

    if (password !== confirmPassword) {
      logAuthWarn('signup_validation_failed', {
        email: safeEmail,
        reason: 'password_mismatch',
      });
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      logAuthWarn('signup_validation_failed', {
        email: safeEmail,
        reason: 'password_too_short',
        passwordLength: password.length,
      });
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    const emailRedirectUrl = buildAdminUrl('/auth/callback');
    emailRedirectUrl.searchParams.set('next', '/onboarding');

    logAuthInfo('signup_account_started', {
      email: safeEmail,
      emailRedirectTo: emailRedirectUrl.toString(),
    });

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: emailRedirectUrl.toString(),
      },
    });
    setLoading(false);

    if (authError) {
      logAuthError('signup_account_failed', authError, { email: safeEmail });
      setError(authError.message);
      return;
    }

    logAuthInfo('signup_account_succeeded', {
      email: safeEmail,
      hasSession: Boolean(data.session),
      hasUser: Boolean(data.user),
    });

    const token =
      data.session?.access_token ??
      // Some Supabase projects require email confirmation before issuing a session.
      // In that case we fall back to sign-in immediately after sign-up.
      (await (async () => {
        logAuthInfo('signup_retry_signin_started', { email: safeEmail });
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          logAuthError('signup_retry_signin_failed', signInError, { email: safeEmail });
          return '';
        }

        logAuthInfo('signup_retry_signin_succeeded', {
          email: safeEmail,
          hasSession: Boolean(signInData.session),
        });
        return signInData.session?.access_token ?? '';
      })());

    if (!token) {
      logAuthWarn('signup_missing_access_token', { email: safeEmail });
    }

    persistAccessTokenCookie(token || null);
    setAccessToken(token);
    logAuthInfo('signup_advanced_to_business_step', {
      email: safeEmail,
      hasAccessToken: Boolean(token),
    });
    setStep(2);
  }

  /* ── Step 2: provision business ─────────────────────────────────────────── */

  async function handleBusinessSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!slug.match(/^[a-z0-9-]+$/)) {
      logAuthWarn('signup_business_validation_failed', {
        slug,
        reason: 'invalid_slug',
      });
      setError('Slug may only contain lowercase letters, numbers, and hyphens.');
      return;
    }

    logAuthInfo('signup_business_started', {
      slug,
      businessNameLength: businessName.trim().length,
      hasAccessToken: Boolean(accessToken),
    });

    setLoading(true);
    const res = await fetchBackend('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ name: businessName, slug }),
    });
    setLoading(false);

    if (res.status === 409) {
      logAuthWarn('signup_business_slug_conflict', { slug });
      setError('That slug is already taken — please choose another.');
      return;
    }

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      logAuthWarn('signup_business_failed', {
        slug,
        status: res.status,
        error: json.error ?? null,
      });
      setError(json.error ?? 'Something went wrong. Please try again.');
      return;
    }

    logAuthInfo('signup_business_succeeded', {
      slug,
      status: res.status,
    });
    router.push('/onboarding');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center text-white font-bold text-xl">
            G
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">
            {step === 1 ? 'Step 1 of 2 — Account details' : 'Step 2 of 2 — Your business'}
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-6 h-1.5 w-full rounded-full bg-gray-200">
          <div
            className="h-1.5 rounded-full bg-brand-500 transition-all duration-500"
            style={{ width: step === 1 ? '50%' : '100%' }}
          />
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 space-y-5">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* ── Step 1 ── */}
          {step === 1 && (
            <form onSubmit={handleAccountSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
                  placeholder="Min. 8 characters"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
                  placeholder="Repeat password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition"
              >
                {loading ? 'Creating account…' : 'Continue →'}
              </button>
            </form>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <form onSubmit={handleBusinessSubmit} className="space-y-5">
              <div>
                <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Business name
                </label>
                <input
                  id="businessName"
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => {
                    setBusinessName(e.target.value);
                    setSlug(slugify(e.target.value));
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
                  placeholder="Acme Corp"
                />
              </div>

              <div>
                <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Public chat URL slug
                </label>
                <div className="flex items-center gap-0 rounded-lg border border-gray-300 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 transition overflow-hidden">
                  <span className="px-3 py-2.5 text-sm text-gray-400 bg-gray-50 border-r border-gray-300 shrink-0 select-none">
                    pnpbrain.com/
                  </span>
                  <input
                    id="slug"
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(slugify(e.target.value))}
                    className="flex-1 px-3 py-2.5 text-sm bg-white focus:outline-none"
                    placeholder="acme-corp"
                    pattern="[a-z0-9\-]+"
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  This URL is shared with your customers. Lowercase letters, numbers, hyphens only.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition"
              >
                {loading ? 'Setting up…' : 'Create business →'}
              </button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-sm text-gray-500 hover:text-gray-700 transition"
              >
                ← Back
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="text-brand-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
