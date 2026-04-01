'use client';

/**
 * Knowledge Base management page.
 * Calls the backend API to list, create, and delete knowledge documents.
 */

import { useEffect, useState } from 'react';
import type { KnowledgeDocument } from '@gcfis/types';
import { fetchBackend } from '@/lib/supabase';

/** Fetches documents from the backend */
async function fetchDocuments(): Promise<KnowledgeDocument[]> {
  const res = await fetchBackend('/api/knowledge');
  if (!res.ok) throw new Error('Failed to fetch documents');
  const json = (await res.json()) as { ok: boolean; data: KnowledgeDocument[] };
  return json.data;
}

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchDocuments()
      .then(setDocuments)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const res = await fetchBackend('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, sourceUrl: sourceUrl || undefined }),
      });
      if (!res.ok) throw new Error('Failed to create document');
      const json = (await res.json()) as { ok: boolean; data: KnowledgeDocument };
      setDocuments((prev) => [json.data, ...prev]);
      setTitle('');
      setContent('');
      setSourceUrl('');
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    const res = await fetchBackend(`/api/knowledge/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      setError('Failed to delete document');
      return;
    }
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Knowledge Base</h1>
      <p className="text-gray-500 mb-8">
        Manage the documents that power your AI assistant's answers.
      </p>

      {/* Create form */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-8 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Add new document</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          />
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="Source URL (optional)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          />
          <textarea
            required
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste document content here…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-y"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60 transition-colors"
          >
            {creating ? 'Saving…' : 'Add document'}
          </button>
        </form>
      </div>

      {/* Document list */}
      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : documents.length === 0 ? (
        <p className="text-gray-400">No documents yet. Add one above.</p>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-start justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">{doc.title}</p>
                {doc.sourceUrl && (
                  <a
                    href={doc.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-500 hover:underline"
                  >
                    {doc.sourceUrl}
                  </a>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Added {new Date(doc.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleDelete(doc.id)}
                className="ml-4 text-xs text-red-400 hover:text-red-600 transition-colors shrink-0"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
