'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  fetchBackend,
  getSupabaseBrowserClient,
  persistAccessTokenCookie,
} from '@/lib/supabase';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/dashboard/knowledge', label: 'Knowledge Base', icon: '📄' },
  { href: '/dashboard/firecrawl', label: 'Firecrawl', icon: '🕷️' },
  { href: '/dashboard/conversations', label: 'Conversations', icon: '💬' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar() {
  const router   = useRouter();
  const pathname = usePathname();
  const [slug, setSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetchBackend('/api/business/me');
      if (!res.ok) return;
      const json = (await res.json()) as { data?: { slug?: string } };
      if (json.data?.slug) setSlug(json.data.slug);
    })();
  }, []);

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    persistAccessTokenCookie(null);
    router.push('/login');
  }

  async function copyUrl() {
    if (!slug) return;
    const url = `${process.env['NEXT_PUBLIC_MARKETING_URL'] ?? 'https://gcfis.app'}/${slug}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-100">
        <div className="h-7 w-7 rounded-lg bg-brand-500 flex items-center justify-center text-white font-bold text-sm">
          G
        </div>
        <span className="font-semibold text-gray-900">GCFIS Admin</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const active =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand-50 text-brand-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-100 space-y-3">
        {/* Public chat URL pill */}
        {slug && (
          <button
            type="button"
            onClick={copyUrl}
            title="Click to copy your public chat URL"
            className="w-full flex items-center gap-2 rounded-lg bg-brand-50 border border-brand-100 px-3 py-2 text-left group hover:bg-brand-100 transition"
          >
            <span className="text-base">🔗</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">Your chat page</p>
              <p className="text-xs text-brand-700 font-mono truncate">/{slug}</p>
            </div>
            <span className="text-[10px] text-brand-500 shrink-0">{copied ? '✓' : 'copy'}</span>
          </button>
        )}

        {/* Sign out */}
        <button
          type="button"
          onClick={signOut}
          className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition text-left"
        >
          <span>🚪</span> Sign out
        </button>

        <p className="text-[10px] text-gray-300 text-center">GCFIS v0.1.0</p>
      </div>
    </aside>
  );
}
