'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchBackend } from '@/lib/supabase';
import { fetchAgents, resolveActiveAgent } from '@/lib/agents';

const fieldCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 transition dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

export default function ThemeSettingsPage() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [hasActiveAgent, setHasActiveAgent] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [primaryColor, setPrimaryColor] = useState('#6366f1');
  const [botName, setBotName] = useState('Assistant');
  const [welcomeMessage, setWelcomeMessage] = useState('Hi! How can I help you today?');
  const [widgetPosition, setWidgetPosition] = useState<'bottom-right' | 'bottom-left'>('bottom-right');
  const [widgetTheme, setWidgetTheme] = useState<'light' | 'dark'>('light');
  const [showAvatar, setShowAvatar] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const agents = await fetchAgents();
        const active = resolveActiveAgent(agents);
        if (!active) {
          setHasActiveAgent(false);
          setLoading(false);
          return;
        }

        setHasActiveAgent(true);
        setAgentId(active.id);

        if (typeof active.primaryColor === 'string') setPrimaryColor(active.primaryColor);
        if (typeof active.botName === 'string') setBotName(active.botName);
        if (typeof active.welcomeMessage === 'string') setWelcomeMessage(active.welcomeMessage);
        if (active.widgetPosition === 'bottom-left' || active.widgetPosition === 'bottom-right') {
          setWidgetPosition(active.widgetPosition);
        }
        if (active.widgetTheme === 'light' || active.widgetTheme === 'dark') {
          setWidgetTheme(active.widgetTheme);
        }
        if (typeof active.showAvatar === 'boolean') setShowAvatar(active.showAvatar);
        setLoading(false);
      } catch {
        setError('Failed to load agent theme configuration.');
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);

    if (!agentId) {
      setSaving(false);
      setError('No active agent selected.');
      return;
    }

    const res = await fetchBackend(`/api/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        primaryColor,
        botName,
        welcomeMessage,
        widgetPosition,
        widgetTheme,
        showAvatar,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? 'Save failed');
      return;
    }

    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  if (loading) return <div className="text-sm text-gray-400 dark:text-slate-500 py-8">Loading…</div>;

  if (!hasActiveAgent) {
    return (
      <div className="max-w-xl rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">No active agent selected</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">
          Create an agent first, then select it to configure widget theme.
        </p>
        <Link href="/dashboard/agents" className="mt-4 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Go to Agents
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-xl">
      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message="Theme settings saved." />}

      <Card title="Visual identity" description="Customize the color and assistant name customers see in the widget.">
        <div className="grid gap-4 sm:grid-cols-[120px_1fr] sm:items-center">
          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-12 w-24 rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900" />
          <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className={`${fieldCls} font-mono`} />
        </div>
        <div className="mt-4">
          <input value={botName} onChange={(e) => setBotName(e.target.value)} className={fieldCls} placeholder="Assistant" maxLength={60} />
        </div>
      </Card>

      <Card title="Greeting" description="The first message shown when the chat opens.">
        <textarea value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} rows={4} className={`${fieldCls} resize-none`} maxLength={200} />
      </Card>

      <Card title="Widget layout" description="Choose where the launcher appears and how the surface is styled.">
        <div className="grid gap-4 sm:grid-cols-2">
          <select value={widgetPosition} onChange={(e) => setWidgetPosition(e.target.value as 'bottom-right' | 'bottom-left')} className={fieldCls}>
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
          </select>
          <select value={widgetTheme} onChange={(e) => setWidgetTheme(e.target.value as 'light' | 'dark')} className={fieldCls}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm text-gray-600 dark:text-slate-300">
          <input type="checkbox" checked={showAvatar} onChange={(e) => setShowAvatar(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
          Show the assistant avatar in the chat header
        </label>
      </Card>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Preview</p>
        <div className="mt-4 max-w-sm rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className={`rounded-2xl px-4 py-3 text-white ${widgetTheme === 'dark' ? 'bg-gray-900' : ''}`} style={widgetTheme === 'light' ? { backgroundColor: primaryColor } : undefined}>
            <div className="flex items-center gap-3">
              {showAvatar && (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
                  {botName[0] ?? 'A'}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold">{botName}</p>
                <p className="text-xs opacity-75">Online</p>
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {welcomeMessage}
          </div>
          <div className="mt-3 text-xs text-gray-400 dark:text-slate-500">Launcher position: {widgetPosition.replace('-', ' ')}</div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition">
          {saving ? 'Saving…' : 'Save theme'}
        </button>
      </div>
    </form>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-0.5">{title}</h3>
      {description && <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">{description}</p>}
      {children}
    </div>
  );
}

function Alert({ type, message }: { type: 'error' | 'success'; message: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${
      type === 'error' ? 'bg-red-50 border-red-200 text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300' : 'bg-green-50 border-green-200 text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300'
    }`}>
      {message}
    </div>
  );
}
