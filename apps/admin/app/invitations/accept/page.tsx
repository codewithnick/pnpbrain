'use client';

/**
 * /invitations/accept?token=<token>
 *
 * Landing page for invited users. Shows the invite details, handles
 * authentication, then calls the accept API endpoint.
 */

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchBackend, getSupabaseBrowserClient } from '@/lib/supabase';

interface InviteDetail {
  id: string;
  businessName: string;
  email: string;
  role: string;
  expiresAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

function AcceptPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [invite, setInvite] = useState<InviteDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [authed, setAuthed] = useState(false);

  // Check auth state
  useEffect(() => {
    (async () => {
      const { data } = await getSupabaseBrowserClient().auth.getUser();
      setAuthed(!!data.user);
    })();
  }, []);

  // Load invite details (public endpoint — no auth needed)
  useEffect(() => {
    if (!token) {
      setLoadError('Missing invitation token.');
      return;
    }
    (async () => {
      const res = await fetch(
        `${process.env['NEXT_PUBLIC_BACKEND_URL'] ?? 'http://localhost:3001'}/api/team/invitations/preview?token=${encodeURIComponent(token)}`,
      );
      const json = (await res.json()) as { ok: boolean; data?: InviteDetail; error?: string };
      if (!res.ok || !json.ok) {
        setLoadError(json.error ?? 'Invitation not found or expired.');
      } else if (json.data) {
        setInvite(json.data);
      }
    })();
  }, [token]);

  async function handleAccept() {
    if (!authed) {
      // Redirect to login with a return URL that brings them back here
      router.push(`/login?next=${encodeURIComponent(`/invitations/accept?token=${token}`)}`);
      return;
    }

    setAccepting(true);
    setAcceptError('');

    const res = await fetchBackend('/api/team/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    const json = (await res.json()) as { ok: boolean; error?: string };

    if (!res.ok || !json.ok) {
      setAcceptError(json.error ?? 'Failed to accept invitation.');
      setAccepting(false);
      return;
    }

    setAccepted(true);
    // Redirect to dashboard after a brief pause
    setTimeout(() => router.push('/dashboard'), 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-100 dark:bg-brand-950/40 mb-4">
            <svg className="w-6 h-6 text-brand-600 dark:text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Team Invitation</h1>
        </div>

        {/* Loading / error state for invite details */}
        {!invite && !loadError && (
          <p className="text-center text-sm text-gray-400 dark:text-slate-500">Loading invitation…</p>
        )}

        {loadError && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300 text-center">
            {loadError}
          </div>
        )}

        {invite && !accepted && (
          <>
            <div className="space-y-3 mb-8">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-slate-400">Business</span>
                <span className="font-medium text-gray-900 dark:text-slate-100">{invite.businessName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-slate-400">Invited email</span>
                <span className="font-medium text-gray-900 dark:text-slate-100">{invite.email}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-slate-400">Role</span>
                <span className="font-medium text-gray-900 dark:text-slate-100">
                  {ROLE_LABELS[invite.role] ?? invite.role}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-slate-400">Expires</span>
                <span className="text-gray-600 dark:text-slate-300">
                  {new Date(invite.expiresAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {acceptError && (
              <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {acceptError}
              </div>
            )}

            <button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {accepting
                ? 'Accepting…'
                : authed
                ? 'Accept invitation'
                : 'Sign in to accept'}
            </button>

            {!authed && (
              <p className="text-center text-xs text-gray-400 dark:text-slate-500 mt-3">
                You&apos;ll be asked to sign in or create an account first.
              </p>
            )}
          </>
        )}

        {accepted && (
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-950/40">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Invitation accepted!</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">Redirecting to your dashboard…</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    }>
      <AcceptPageInner />
    </Suspense>
  );
}
