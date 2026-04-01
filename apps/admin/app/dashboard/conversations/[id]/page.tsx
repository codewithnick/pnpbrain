'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AgentMemoryFactItem, ConversationDetail, MemoryFactItem } from '@/lib/api-types';
import { fetchBackend } from '@/lib/supabase';

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const conversationId = typeof params.id === 'string' ? params.id : '';

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [memoryFacts, setMemoryFacts] = useState<MemoryFactItem[]>([]);
  const [agentMemoryFacts, setAgentMemoryFacts] = useState<AgentMemoryFactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [memoryLoading, setMemoryLoading] = useState(true);
  const [agentMemoryLoading, setAgentMemoryLoading] = useState(true);
  const [error, setError] = useState('');
  const [memoryError, setMemoryError] = useState('');
  const [agentMemoryError, setAgentMemoryError] = useState('');
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const [deletingAgentMemoryId, setDeletingAgentMemoryId] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) return;

    setLoading(true);
    setMemoryLoading(true);
    setAgentMemoryLoading(true);
    setError('');
    setMemoryError('');
    setAgentMemoryError('');

    fetchBackend(`/api/conversations/${conversationId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load conversation');
        const json = (await res.json()) as { data: ConversationDetail };
        setConversation(json.data);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load conversation')
      )
      .finally(() => setLoading(false));

    fetchBackend(`/api/memory?conversationId=${encodeURIComponent(conversationId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load memory');
        const json = (await res.json()) as { data: MemoryFactItem[] };
        setMemoryFacts(json.data);
      })
      .catch((err: unknown) =>
        setMemoryError(err instanceof Error ? err.message : 'Failed to load memory')
      )
      .finally(() => setMemoryLoading(false));

    fetchBackend('/api/memory/agent')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load agent memory');
        const json = (await res.json()) as { data: AgentMemoryFactItem[] };
        setAgentMemoryFacts(json.data);
      })
      .catch((err: unknown) =>
        setAgentMemoryError(err instanceof Error ? err.message : 'Failed to load agent memory')
      )
      .finally(() => setAgentMemoryLoading(false));
  }, [conversationId]);

  async function handleDeleteMemory(memoryFactId: string) {
    setDeletingMemoryId(memoryFactId);
    setMemoryError('');

    try {
      const res = await fetchBackend(`/api/memory/${memoryFactId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? 'Failed to delete memory');
      }

      setMemoryFacts((current) => current.filter((item) => item.id !== memoryFactId));
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Failed to delete memory');
    } finally {
      setDeletingMemoryId(null);
    }
  }

  async function handleDeleteAgentMemory(memoryFactId: string) {
    setDeletingAgentMemoryId(memoryFactId);
    setAgentMemoryError('');

    try {
      const res = await fetchBackend(`/api/memory/agent/${memoryFactId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? 'Failed to delete agent memory');
      }

      setAgentMemoryFacts((current) => current.filter((item) => item.id !== memoryFactId));
    } catch (err) {
      setAgentMemoryError(err instanceof Error ? err.message : 'Failed to delete agent memory');
    } finally {
      setDeletingAgentMemoryId(null);
    }
  }

  let content: React.ReactNode = null;

  if (loading) {
    content = (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-400 shadow-sm">
        Loading conversation…
      </div>
    );
  } else if (conversation) {
    let memoryContent: React.ReactNode;
    let agentMemoryContent: React.ReactNode;

    if (memoryLoading) {
      memoryContent = (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-400">
          Loading memory…
        </div>
      );
    } else if (memoryFacts.length === 0) {
      memoryContent = (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-400">
          No memory facts saved for this conversation yet.
        </div>
      );
    } else {
      memoryContent = memoryFacts.map((memoryFact) => {
        const isDeleting = deletingMemoryId === memoryFact.id;

        return (
          <div
            key={memoryFact.id}
            className="rounded-2xl border border-gray-200 bg-white p-4"
          >
            <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
              {memoryFact.fact}
            </p>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-gray-400">
                Added {new Date(memoryFact.createdAt).toLocaleString()}
              </span>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteMemory(memoryFact.id)}
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

    if (agentMemoryLoading) {
      agentMemoryContent = (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-400">
          Loading agent memory…
        </div>
      );
    } else if (agentMemoryFacts.length === 0) {
      agentMemoryContent = (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-400">
          No business-wide agent memory yet.
        </div>
      );
    } else {
      agentMemoryContent = agentMemoryFacts.map((memoryFact) => {
        const isDeleting = deletingAgentMemoryId === memoryFact.id;

        return (
          <div
            key={memoryFact.id}
            className="rounded-2xl border border-gray-200 bg-white p-4"
          >
            <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
              {memoryFact.fact}
            </p>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-gray-400">
                Source: {memoryFact.source} • Updated {new Date(memoryFact.updatedAt).toLocaleString()}
              </span>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteAgentMemory(memoryFact.id)}
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

    content = (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            {conversation.messages.map((message) => {
              let messageClassName = 'border border-amber-200 bg-amber-50 text-amber-900';
              if (message.role === 'user') {
                messageClassName = 'bg-brand-500 text-white';
              } else if (message.role === 'assistant') {
                messageClassName = 'border border-gray-200 bg-gray-50 text-gray-800';
              }

              return (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-3xl rounded-2xl px-4 py-3 text-sm shadow-sm ${messageClassName}`}>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                      {message.role}
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between xl:flex-col xl:items-start">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Memory Sidebar</h2>
                <p className="text-sm text-gray-500">
                  Memory is agent-managed. You can review and delete facts if they are no longer useful.
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
                {memoryFacts.length + agentMemoryFacts.length} facts
              </span>
            </div>

            {memoryError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {memoryError}
              </div>
            )}

            {agentMemoryError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {agentMemoryError}
              </div>
            )}

            <div className="mt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Conversation Memory</h3>
            </div>

            <div className="mt-6 space-y-3">{memoryContent}</div>

            <div className="mt-8 border-t border-gray-200 pt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Agentic Memory</h3>
              <p className="mt-1 text-sm text-gray-500">
                Reused across future conversations for this business.
              </p>

              <div className="mt-4 space-y-3">{agentMemoryContent}</div>
            </div>
          </div>
        </aside>
      </div>
    );
  }

  return (
    <div className="max-w-7xl p-8">
      <Link href="/dashboard/conversations" className="text-sm font-medium text-brand-600 hover:text-brand-700">
        ← Back to conversations
      </Link>

      <div className="mt-4 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Conversation Detail</h1>
        {conversation && (
          <p className="mt-2 text-sm text-gray-500">
            Session {conversation.sessionId.slice(0, 8)} • Started {new Date(conversation.createdAt).toLocaleString()}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {content}
    </div>
  );
}