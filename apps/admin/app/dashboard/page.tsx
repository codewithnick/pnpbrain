'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DashboardStats } from '@gcfis/types';
import { fetchBackend } from '@/lib/supabase';

const statCards = [
  { label: 'Total Conversations', key: 'conversations', icon: '💬' },
  { label: 'Knowledge Documents', key: 'knowledgeDocuments', icon: '📄' },
  { label: 'Memory Facts', key: 'memoryFacts', icon: '🧠' },
  { label: 'Crawl Jobs', key: 'crawlJobs', icon: '🕷️' },
] as const;

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchBackend('/api/dashboard/stats')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load dashboard stats');
        const json = (await res.json()) as { data: DashboardStats };
        setStats(json.data);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load dashboard stats')
      );
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
      <p className="text-gray-500 mb-8">Track adoption, refresh knowledge, and review recent conversations.</p>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="text-2xl mb-3">{stat.icon}</div>
            <p className="text-3xl font-bold text-gray-900">{stats ? stats[stat.key] : '–'}</p>
            <p className="mt-1 text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Operational status</h2>
          <p className="mt-2 text-sm text-gray-500">
            Your backend is ready to serve live conversations. The next step is populating the knowledge base and embedding the widget.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link href="/dashboard/knowledge" className="rounded-xl border border-gray-200 px-4 py-4 hover:border-brand-300 hover:bg-brand-50 transition">
              <p className="text-sm font-semibold text-gray-900">Add knowledge</p>
              <p className="mt-1 text-xs text-gray-500">Upload core FAQs, policies, and product info.</p>
            </Link>
            <Link href="/dashboard/firecrawl" className="rounded-xl border border-gray-200 px-4 py-4 hover:border-brand-300 hover:bg-brand-50 transition">
              <p className="text-sm font-semibold text-gray-900">Run Firecrawl</p>
              <p className="mt-1 text-xs text-gray-500">Refresh documentation or pricing pages from approved domains.</p>
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">MVP checklist</h2>
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            <p>1. Complete onboarding and confirm your model settings.</p>
            <p>2. Add at least one knowledge document or approved crawl URL.</p>
            <p>3. Embed the widget on your site or install the WordPress plugin.</p>
            <p>4. Review live conversations and refine answers from the dashboard.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
