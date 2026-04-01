'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchBackend } from '@/lib/supabase';

async function saveBusinessProfile(payload: { name: string; description: string }) {
  const res = await fetchBackend('/api/business/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? 'Save failed');
  }
}

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const res = await fetchBackend('/api/business/me');
      if (!res.ok) return;

      const json = (await res.json()) as { data?: Record<string, unknown> };
      const data = json.data;
      if (!data) return;

      if (typeof data.name === 'string') setName(data.name);
      if (typeof data.description === 'string') setDescription(data.description);
    })();
  }, []);

  const onContinue = async () => {
    setSaving(true);
    setError('');
    try {
      await saveBusinessProfile({ name, description });
      router.push('/dashboard/agents');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center text-white font-bold text-xl">
            P
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome to PNPBrain</h1>
          <p className="mt-2 text-gray-500">
            Set your business profile. You will configure skills, integrations, and model settings per agent after creating one.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Business profile</h2>
            <p className="text-sm text-gray-500">
              This information helps your team identify this workspace across multiple businesses.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Business name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              placeholder="Acme Corp"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Business description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none"
              placeholder="Short summary about your business"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onContinue}
              disabled={saving || !name.trim()}
              className="inline-flex items-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Continue to Agents'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
