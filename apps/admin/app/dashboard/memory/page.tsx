'use client';

import { useEffect, useState } from 'react';
import type { AgentMemoryFactItem } from '@/lib/api-types';
import { fetchBackend } from '@/lib/supabase';

export default function MemoryPage() {
  const [facts, setFacts] = useState<AgentMemoryFactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    void loadFacts();
  }, []);

  async function loadFacts() {
    setLoading(true);
    setError('');

    try {
      const res = await fetchBackend('/api/memory/agent');
      if (!res.ok) {
        throw new Error('Failed to load memory');
      }

      const json = (await res.json()) as { data: AgentMemoryFactItem[] };
      setFacts(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(memoryFactId: string) {
    setDeletingId(memoryFactId);
    setError('');

    try {
      const res = await fetchBackend(`/api/memory/agent/${memoryFactId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? 'Failed to delete memory');
      }

      setFacts((current) => current.filter((item) => item.id !== memoryFactId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete memory');
    } finally {
      setDeletingId(null);
    }
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredFacts = facts.filter((memoryFact) => {
    if (!normalizedSearchQuery) return true;
    return (
      memoryFact.fact.toLowerCase().includes(normalizedSearchQuery) ||
      memoryFact.source.toLowerCase().includes(normalizedSearchQuery)
    );
  });

  let factsContent: React.ReactNode;

  if (loading) {
    factsContent = (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-400">
        Loading memory…
      </div>
    );
  } else if (facts.length === 0) {
    factsContent = (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-400">
        No agent memory facts yet.
      </div>
    );
  } else if (filteredFacts.length === 0) {
    factsContent = (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-400">
        No memory facts match your search.
      </div>
    );
  } else {
    factsContent = filteredFacts.map((memoryFact) => {
      const isDeleting = deletingId === memoryFact.id;

      return (
        <div key={memoryFact.id} className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{memoryFact.fact}</p>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-gray-400">
              Source: {memoryFact.source} • Updated {new Date(memoryFact.updatedAt).toLocaleString()}
            </span>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleDelete(memoryFact.id)}
                disabled={isDeleting}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      );
    });
  }

  return (
    <div className="max-w-7xl p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Agent Memory</h1>
        <p className="mt-2 text-sm text-gray-500">
          Business-wide memory the agent builds over time. Users can review and delete facts; creation and updates are agent-managed.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search memory facts..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        {factsContent}
      </div>
    </div>
  );
}
