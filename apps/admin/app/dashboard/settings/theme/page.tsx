'use client';

import { useEffect, useState } from 'react';
import { fetchBackend } from '@/lib/supabase';

const fieldCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 transition';

export default function ThemeSettingsPage() {
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
      const res = await fetchBackend('/api/business/me');
      if (!res.ok) {
        setLoading(false);
        return;
      }

      const json = (await res.json()) as { data?: Record<string, unknown> };
      const data = json.data;
      if (!data) {
        setLoading(false);
        return;
      }

      if (typeof data.primaryColor === 'string') setPrimaryColor(data.primaryColor);
      if (typeof data.botName === 'string') setBotName(data.botName);
      if (typeof data.welcomeMessage === 'string') setWelcomeMessage(data.welcomeMessage);
      if (data.widgetPosition === 'bottom-left' || data.widgetPosition === 'bottom-right') {
        setWidgetPosition(data.widgetPosition);
      }
      if (data.widgetTheme === 'light' || data.widgetTheme === 'dark') {
        setWidgetTheme(data.widgetTheme);
      }
      if (typeof data.showAvatar === 'boolean') setShowAvatar(data.showAvatar);
      setLoading(false);
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);

    const res = await fetchBackend('/api/business/me', {
      method: 'PUT',
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

  if (loading) return <div className="text-sm text-gray-400 py-8">Loading…</div>;

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-xl">
      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message="Theme settings saved." />}

      <Card title="Visual identity" description="Customize the color and assistant name customers see in the widget.">
        <div className="grid gap-4 sm:grid-cols-[120px_1fr] sm:items-center">
          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-12 w-24 rounded-lg border border-gray-200 bg-white" />
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
        <label className="mt-4 flex items-center gap-3 text-sm text-gray-600">
          <input type="checkbox" checked={showAvatar} onChange={(e) => setShowAvatar(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
          Show the assistant avatar in the chat header
        </label>
      </Card>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">Preview</p>
        <div className="mt-4 max-w-sm rounded-3xl border border-gray-200 bg-gray-50 p-4">
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
          <div className="mt-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            {welcomeMessage}
          </div>
          <div className="mt-3 text-xs text-gray-400">Launcher position: {widgetPosition.replace('-', ' ')}</div>
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
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 mb-0.5">{title}</h3>
      {description && <p className="text-xs text-gray-500 mb-3">{description}</p>}
      {children}
    </div>
  );
}

function Alert({ type, message }: { type: 'error' | 'success'; message: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${
      type === 'error' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-700'
    }`}>
      {message}
    </div>
  );
}
