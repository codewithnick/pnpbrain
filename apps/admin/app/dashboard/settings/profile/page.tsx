'use client';

/**
 * Settings → Profile
 * Business name, slug (public URL), description.
 */

import { useEffect, useState } from 'react';
import { fetchBackend } from '@/lib/supabase';

function slugify(v: string) {
  return v.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 40);
}

export default function ProfileSettingsPage() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState('');

  const [name, setName]           = useState('');
  const [slug, setSlug]           = useState('');
  const [originalSlug, setOriginalSlug] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    (async () => {
      const res = await fetchBackend('/api/business/me');
      if (!res.ok) { setLoading(false); return; }
      const json = (await res.json()) as { data?: Record<string, unknown> };
      const d = json.data;
      if (!d) { setLoading(false); return; }
      if (typeof d.name === 'string')        setName(d.name);
      if (typeof d.slug === 'string')        { setSlug(d.slug); setOriginalSlug(d.slug); }
      if (typeof d.description === 'string') setDescription(d.description);
      setLoading(false);
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSaving(true);

    const res = await fetchBackend('/api/business/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, description }),
    });
    setSaving(false);

    if (res.status === 409) { setError('That slug is already taken.'); return; }
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? 'Save failed');
      return;
    }
    setOriginalSlug(slug);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  if (loading) return <div className="text-sm text-gray-400 py-8">Loading…</div>;

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-xl">
      {error   && <Alert type="error"   message={error} />}
      {success && <Alert type="success" message="Saved successfully." />}

      <Card title="Business name" description="Shown in the chat header and on your public page.">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={fieldCls}
          placeholder="Acme Corp"
        />
      </Card>

      <Card title="Public chat URL" description={`Your customers will visit this URL to chat with your assistant.`}>
        <div className="flex items-center gap-0 rounded-lg border border-gray-300 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 transition overflow-hidden">
          <span className="px-3 py-2.5 text-sm text-gray-400 bg-gray-50 border-r border-gray-300 shrink-0 select-none">
            gcfis.app/
          </span>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            required
            pattern="[a-z0-9-]+"
            className="flex-1 px-3 py-2.5 text-sm bg-white focus:outline-none font-mono"
            placeholder="acme-corp"
          />
        </div>
        {slug && slug !== originalSlug && (
          <p className="mt-1.5 text-xs text-amber-600">
            ⚠ Changing your slug will break any shared links using the old URL.
          </p>
        )}
      </Card>

      <Card title="Business description" description="Provides context to the AI. Not shown to customers.">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className={`${fieldCls} resize-none`}
          placeholder="We are an e-commerce platform specialising in eco-friendly home goods…"
          maxLength={500}
        />
        <p className="mt-1 text-xs text-right text-gray-400">{description.length}/500</p>
      </Card>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}

const fieldCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 transition';

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 mb-0.5">{title}</h3>
      {description && <p className="text-xs text-gray-500 mb-3">{description}</p>}
      {children}
    </div>
  );
}

function Alert({ type, message }: { type: 'error' | 'success'; message: string }) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        type === 'error'
          ? 'bg-red-50 border-red-200 text-red-600'
          : 'bg-green-50 border-green-200 text-green-700'
      }`}
    >
      {message}
    </div>
  );
}
