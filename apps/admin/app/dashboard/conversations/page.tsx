'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ConversationSummary } from '@gcfis/types';
import { fetchBackend } from '@/lib/supabase';

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchBackend('/api/conversations?limit=50')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load conversations');
        const json = (await res.json()) as { data: ConversationSummary[] };
        setConversations(json.data);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load conversations')
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Conversation Logs</h1>
      <p className="text-gray-500 mb-8">
        Review all customer conversations handled by the AI assistant.
      </p>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-400 shadow-sm">
          Loading conversations…
        </div>
      ) : conversations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-400">
          <p className="text-4xl mb-4">💬</p>
          <p className="font-medium text-gray-500">No conversations yet</p>
          <p className="text-sm mt-1">
            Once your widget is live, conversations will appear here for review.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/dashboard/conversations/${conversation.id}`}
              className="block rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    Session {conversation.sessionId.slice(0, 8)}
                  </p>
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                    {conversation.preview || 'No preview available yet.'}
                  </p>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
                  {conversation.messageCount} messages
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-400">
                <span>Last update {new Date(conversation.lastMessageAt).toLocaleString()}</span>
                <span>{conversation.userMessageCount} customer messages</span>
                <span>Started {new Date(conversation.createdAt).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
