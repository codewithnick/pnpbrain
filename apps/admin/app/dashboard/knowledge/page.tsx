'use client';

/**
 * Knowledge Base management page.
 * Calls the backend API to list, create, retrieve, and delete knowledge documents.
 */

import { useEffect, useState } from 'react';
import type { KnowledgeDocument } from '@/lib/api-types';
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

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  const [previewDoc, setPreviewDoc] = useState<KnowledgeDocument | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    fetchDocuments()
      .then(setDocuments)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError('');

    try {
      let res: Response;

      if (file) {
        const formData = new FormData();
        formData.append('title', title);
        formData.append('file', file);
        if (sourceUrl.trim()) formData.append('sourceUrl', sourceUrl.trim());

        res = await fetchBackend('/api/knowledge', {
          method: 'POST',
          body: formData,
        });
      } else {
        if (!content.trim()) {
          throw new Error('Please paste content or choose a file.');
        }

        res = await fetchBackend('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content, sourceUrl: sourceUrl || undefined }),
        });
      }

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? 'Failed to create document');
      }

      const json = (await res.json()) as { ok: boolean; data: KnowledgeDocument };
      setDocuments((prev) => [json.data, ...prev]);
      setTitle('');
      setContent('');
      setSourceUrl('');
      setFile(null);

      const fileInput = document.getElementById('knowledge-file-input') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
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

    if (previewDoc?.id === id) {
      setPreviewDoc(null);
      setPreviewContent('');
    }

    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  async function handlePreview(doc: KnowledgeDocument) {
    setPreviewLoading(true);
    setError('');

    try {
      const res = await fetchBackend(`/api/knowledge/${doc.id}`);
      if (!res.ok) {
        throw new Error('Failed to load document content');
      }

      const json = (await res.json()) as { ok: boolean; data: KnowledgeDocument };
      setPreviewDoc(json.data);
      setPreviewContent(json.data.content);
    } catch (err) {
      setError(String(err));
    } finally {
      setPreviewLoading(false);
    }
  }

  let documentsContent: React.ReactNode;
  if (loading) {
    documentsContent = <p className="text-gray-400 dark:text-slate-500">Loading...</p>;
  } else if (documents.length === 0) {
    documentsContent = <p className="text-gray-400 dark:text-slate-500">No documents yet. Add one above.</p>;
  } else {
    documentsContent = (
      <div className="space-y-3">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{doc.title}</p>
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
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                  Added {new Date(doc.createdAt).toLocaleDateString()} {doc.sizeBytes ? `| ${doc.sizeBytes} bytes` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => handlePreview(doc)}
                  disabled={previewLoading}
                  className="text-xs text-brand-600 hover:text-brand-700 transition-colors"
                >
                  View content
                </button>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            {previewDoc?.id === doc.id && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs font-medium text-gray-600 dark:text-slate-300 mb-2">Document Preview</p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs text-gray-700 dark:text-slate-200">
                  {previewContent}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">Knowledge Base</h1>
      <p className="text-gray-500 dark:text-slate-400 mb-8">
        Upload and manage the documents that power your AI assistant&apos;s answers.
      </p>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">Add new document</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="Source URL (optional)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />

          <div className="rounded-lg border border-dashed border-gray-300 p-4 dark:border-slate-700">
            <label htmlFor="knowledge-file-input" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
              Upload file (preferred)
            </label>
            <input
              id="knowledge-file-input"
              type="file"
              accept=".txt,.md,.json,.csv,.xml,text/plain,text/markdown,application/json,text/csv,application/xml,text/xml"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-700 dark:text-slate-200"
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
              Supports UTF-8 text files. If you do not upload a file, pasted content below will be used.
            </p>
          </div>

          <textarea
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste document content here if you are not uploading a file..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-y dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />

          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60 transition-colors"
          >
            {creating ? 'Saving...' : 'Add document'}
          </button>
        </form>
      </div>

      {error && <p className="text-red-500 dark:text-red-300 text-sm mb-4">{error}</p>}
      {documentsContent}
    </div>
  );
}
