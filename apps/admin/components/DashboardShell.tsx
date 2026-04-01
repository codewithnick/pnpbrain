'use client';

/**
 * DashboardShell wraps the sidebar + a top banner showing the business public chat URL.
 * Extracted from layout.tsx so it can be a client component (banner fetches session data).
 */

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Sidebar from '@/components/Sidebar';

function getSupabase() {
  return createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? ''
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [slug, setSlug]     = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const base = process.env['NEXT_PUBLIC_BACKEND_URL'] ?? '';
      const res = await fetch(`${base}/api/business/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = (await res.json()) as { data?: { slug?: string } };
      if (json.data?.slug) setSlug(json.data.slug);
    })();
  }, []);

  const publicUrl = slug
    ? `${process.env['NEXT_PUBLIC_MARKETING_URL'] ?? 'https://gcfis.app'}/${slug}`
    : null;

  async function copyUrl() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top banner — public chat URL */}
        {publicUrl && (
          <div className="shrink-0 flex items-center justify-between gap-4 bg-brand-50 border-b border-brand-100 px-5 py-2">
            <p className="text-xs text-gray-600">
              Your public chat page:{' '}
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono font-semibold text-brand-600 hover:underline"
              >
                {publicUrl}
              </a>
            </p>
            <button
              type="button"
              onClick={copyUrl}
              className="shrink-0 rounded-md border border-brand-200 bg-white px-3 py-1 text-xs font-medium text-brand-600 hover:bg-brand-100 transition"
            >
              {copied ? '✓ Copied' : 'Copy link'}
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
