'use client';

/**
 * Settings → Skills
 * Enable/disable agent tools and configure Firecrawl allowed domains.
 */

import { useEffect, useState } from 'react';
import { fetchBackend } from '@/lib/supabase';

const SKILLS = [
  {
    key: 'calculator',
    icon: '🔢',
    title: 'Calculator',
    description:
      'Lets the agent perform arithmetic expressions accurately. Useful for pricing, measurements, and date-range questions.',
  },
  {
    key: 'datetime',
    icon: '🕐',
    title: 'Date & Time',
    description:
      'Answers questions about the current date, time, and timezone conversions using the IANA timezone database.',
  },
  {
    key: 'firecrawl',
    icon: '🕷️',
    title: 'Web Scraping (Firecrawl)',
    description:
      'Crawls pages from your allowed domains in real-time to inject fresh content into the agent\'s context. Useful for live FAQs, pricing pages, and documentation.',
  },
];

export default function SkillsSettingsPage() {
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [success, setSuccess]           = useState(false);
  const [error, setError]               = useState('');

  const [enabledSkills, setEnabledSkills]   = useState<string[]>(['calculator', 'datetime']);
  const [allowedDomains, setAllowedDomains] = useState('');

  useEffect(() => {
    (async () => {
      const res = await fetchBackend('/api/business/me');
      if (!res.ok) { setLoading(false); return; }
      const json = (await res.json()) as { data?: Record<string, unknown> };
      const d = json.data;
      if (!d) { setLoading(false); return; }
      if (Array.isArray(d.enabledSkills)) setEnabledSkills(d.enabledSkills as string[]);
      if (Array.isArray(d.allowedDomains))
        setAllowedDomains((d.allowedDomains as string[]).join('\n'));
      setLoading(false);
    })();
  }, []);

  function toggleSkill(key: string) {
    setEnabledSkills((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSaving(true);

    const domains = allowedDomains
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean);

    // Basic URL validation
    for (const d of domains) {
      try { new URL(d); } catch {
        setError(`Invalid URL: ${d}`);
        setSaving(false);
        return;
      }
    }

    const res = await fetchBackend('/api/business/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabledSkills, allowedDomains: domains }),
    });
    setSaving(false);

    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? 'Save failed');
      return;
    }

    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  if (loading) return <div className="text-sm text-gray-400 py-8">Loading…</div>;

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-xl">
      {error   && <Alert type="error"   message={error} />}
      {success && <Alert type="success" message="Skills saved." />}

      {/* Skill toggles */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Agent skills</h3>
        <p className="text-xs text-gray-500 mb-4">
          Enable the tools that make sense for your use-case. Changes take effect immediately.
        </p>

        <div className="space-y-3">
          {SKILLS.map((skill) => {
            const active = enabledSkills.includes(skill.key);
            return (
              <div
                key={skill.key}
                className={`flex items-start gap-4 p-4 rounded-xl border-2 transition-all ${
                  active ? 'border-brand-500 bg-brand-50' : 'border-gray-200'
                }`}
              >
                <span className="text-2xl mt-0.5 shrink-0">{skill.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${active ? 'text-brand-700' : 'text-gray-900'}`}>
                    {skill.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{skill.description}</p>
                </div>
                {/* Toggle switch */}
                <button
                  type="button"
                  onClick={() => toggleSkill(skill.key)}
                  className={`relative shrink-0 mt-0.5 h-6 w-11 rounded-full transition-colors ${
                    active ? 'bg-brand-500' : 'bg-gray-300'
                  }`}
                  aria-label={`${active ? 'Disable' : 'Enable'} ${skill.title}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Firecrawl domain allowlist */}
      {enabledSkills.includes('firecrawl') && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Allowed domains</h3>
          <p className="text-xs text-gray-500 mb-3">
            The Firecrawl tool may only scrape pages on these domains. Enter one full URL per line
            (e.g. <code className="bg-gray-100 px-1 rounded">https://docs.example.com</code>).
            Leave blank to deny all scraping.
          </p>
          <textarea
            value={allowedDomains}
            onChange={(e) => setAllowedDomains(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none transition"
            placeholder={'https://docs.example.com\nhttps://support.example.com'}
          />
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : 'Save skills'}
        </button>
      </div>
    </form>
  );
}

function Alert({ type, message }: { type: 'error' | 'success'; message: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${
      type === 'error' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-700'
    }`}>{message}</div>
  );
}
