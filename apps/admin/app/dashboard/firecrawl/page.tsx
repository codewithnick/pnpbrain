'use client';

/**
 * Firecrawl skill page — trigger a web crawl to refresh the knowledge base.
 */

import { useState } from 'react';
import { fetchBackend } from '@/lib/supabase';

export default function FirecrawlPage() {
  const [urls, setUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ jobId: string; status: string } | null>(null);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    const urlList = urls
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);

    try {
      const res = await fetchBackend('/api/skills/firecrawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urlList }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { jobId: string; status: string };
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? 'Failed to start crawl job');
      }
      setResult(json.data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">Firecrawl Refresh</h1>
      <p className="text-gray-500 dark:text-slate-400 mb-8">
        Crawl approved web pages and automatically add them to your knowledge base.
        Only URLs from your configured allowed domains will be accepted.
      </p>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              URLs to crawl (one per line)
            </label>
            <textarea
              required
              rows={8}
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder="https://yoursite.com/products&#10;https://yoursite.com/faq"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand-500 resize-y dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60 transition-colors"
          >
            {loading ? 'Starting crawl…' : 'Start crawl job'}
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300">
            <p>
              Crawl job started! Job ID:{' '}
              <code className="font-mono text-xs bg-green-100 px-1 rounded dark:bg-green-900/50">{result.jobId}</code>
            </p>
            <p className="mt-1">Status: {result.status}</p>
            <p className="mt-2 text-green-600 dark:text-green-300">
              Pages will be added to your knowledge base automatically once crawled.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
