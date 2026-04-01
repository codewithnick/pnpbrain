'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchBackend, getSelectedAgentId, setSelectedAgentId } from '@/lib/supabase';
import type { Agent } from '@/lib/api-types';

interface AgentCreatePayload {
  name: string;
  slug: string;
  description?: string;
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAgentIdState, setSelectedAgentIdState] = useState<string | null>(null);

  const canCreate = useMemo(() => name.trim().length >= 2 && slug.trim().length >= 2, [name, slug]);

  async function loadAgents() {
    const res = await fetchBackend('/api/agents');
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error ?? 'Failed to load agents');
    }

    const json = (await res.json()) as { data?: Agent[] };
    const rows = Array.isArray(json.data) ? json.data : [];
    setAgents(rows);

    const selected = getSelectedAgentId();
    setSelectedAgentIdState(selected);

    if (selected && !rows.some((agent) => agent.id === selected)) {
      setSelectedAgentId(null);
      setSelectedAgentIdState(null);
    }
  }

  useEffect(() => {
    void (async () => {
      setError('');
      try {
        await loadAgents();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agents');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!name.trim()) {
      setSlug('');
      return;
    }

    setSlug((prev) => {
      if (prev.trim().length > 0) {
        return prev;
      }
      return toSlug(name);
    });
  }, [name]);

  async function createAgent() {
    if (!canCreate) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload: AgentCreatePayload = {
        name: name.trim(),
        slug: slug.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      };

      const res = await fetchBackend('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: Agent; error?: string };
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? 'Failed to create agent');
      }

      await loadAgents();
      setSelectedAgentId(json.data.id);
      setSelectedAgentIdState(json.data.id);
      setName('');
      setSlug('');
      setDescription('');
      setSuccess('Agent created and selected.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setSaving(false);
    }
  }

  async function setDefaultAgent(agentId: string) {
    setError('');
    setSuccess('');
    try {
      const res = await fetchBackend(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to set default agent');
      }

      await loadAgents();
      setSuccess('Default agent updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default agent');
    }
  }

  function selectAgent(agentId: string) {
    setSelectedAgentId(agentId);
    setSelectedAgentIdState(agentId);
    setSuccess('Agent selected. Refreshing dashboard context...');
    window.location.reload();
  }

  if (loading) {
    return <div className="py-8 text-sm text-gray-400 dark:text-slate-500">Loading agents...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Agents</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Each agent has its own model config, skills, integrations, API key, and knowledge base.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300">
          {success}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Create agent</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">Name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Support Agent"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">Slug</label>
            <input
              value={slug}
              onChange={(event) => setSlug(toSlug(event.target.value))}
              placeholder="support-agent"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">Description</label>
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What this agent should handle"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={createAgent}
            disabled={saving || !canCreate}
            className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Creating...' : 'Create agent'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Your agents</h2>
        {agents.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500 dark:text-slate-400">
            No agents yet. Create your first agent to start configuring skills and integrations.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {agents.map((agent) => {
              const isSelected = selectedAgentIdState === agent.id;
              return (
                <div
                  key={agent.id}
                  className="rounded-xl border border-gray-200 px-4 py-3 dark:border-slate-700"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-slate-100">{agent.name}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">/{agent.slug}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {agent.isDefault && (
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                          Default
                        </span>
                      )}
                      {isSelected && (
                        <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-300">
                          Selected
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">
                    {agent.description || 'No description'}
                  </p>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => selectAgent(agent.id)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Select
                    </button>
                    {!agent.isDefault && (
                      <button
                        type="button"
                        onClick={() => void setDefaultAgent(agent.id)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Make default
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
