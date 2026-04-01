'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ConversationDetail } from '@gcfis/types';
import { fetchBackend } from '@/lib/supabase';

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const conversationId = typeof params.id === 'string' ? params.id : '';

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!conversationId) return;

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
  }, [conversationId]);

  return (
    <div className="p-8 max-w-5xl">
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

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-400 shadow-sm">
          Loading conversation…
        </div>
      ) : conversation ? (
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            {conversation.messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-3xl rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    message.role === 'user'
                      ? 'bg-brand-500 text-white'
                      : message.role === 'assistant'
                      ? 'border border-gray-200 bg-gray-50 text-gray-800'
                      : 'border border-amber-200 bg-amber-50 text-amber-900'
                  }`}
                >
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                    {message.role}
                  </div>
                  <div>{message.content}</div>
                  <div className="mt-2 text-[11px] opacity-60">
                    {new Date(message.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}