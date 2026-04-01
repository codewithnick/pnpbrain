'use client';

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
    key: 'lead_qualification',
    icon: '🎯',
    title: 'Lead Qualification',
    description:
      'Scores sales readiness from discovery signals (budget, urgency, authority, timeline) and suggests next action.',
  },
  {
    key: 'meeting_scheduler',
    icon: '📅',
    title: 'Meeting Scheduler',
    description:
      'Suggests slots and can book meetings directly with your connected calendar provider.',
  },
  {
    key: 'firecrawl',
    icon: '🕷️',
    title: 'Web Scraping (Firecrawl)',
    description:
      "Crawls pages from your allowed domains in real-time to inject fresh content into the agent's context. Useful for live FAQs, pricing pages, and documentation.",
  },
];

export default function SkillsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [enabledSkills, setEnabledSkills] = useState<string[]>(['calculator', 'datetime']);
  const [allowedDomains, setAllowedDomains] = useState('');
  const [meetingProvider, setMeetingProvider] = useState<'none' | 'google' | 'zoom' | 'calendly'>('none');
  const [meetingTimezone, setMeetingTimezone] = useState('UTC');
  const [calendarId, setCalendarId] = useState('primary');
  const [calendlySchedulingUrl, setCalendlySchedulingUrl] = useState('');
  const [hasGoogleAccessToken, setHasGoogleAccessToken] = useState(false);
  const [hasZoomAccessToken, setHasZoomAccessToken] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<'google' | 'zoom' | null>(null);

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

      const oauthStatus = new URLSearchParams(window.location.search).get('oauth');
      if (oauthStatus === 'google_connected') {
        setSuccess(true);
      }
      if (oauthStatus === 'zoom_connected') {
        setSuccess(true);
      }

      if (Array.isArray(data.enabledSkills)) setEnabledSkills(data.enabledSkills as string[]);
      if (Array.isArray(data.allowedDomains)) setAllowedDomains((data.allowedDomains as string[]).join('\n'));
      if (data.meetingIntegration && typeof data.meetingIntegration === 'object') {
        const meeting = data.meetingIntegration as Record<string, unknown>;
        if (meeting.provider === 'google' || meeting.provider === 'zoom' || meeting.provider === 'calendly' || meeting.provider === 'none') {
          setMeetingProvider(meeting.provider);
        }
        if (typeof meeting.timezone === 'string') setMeetingTimezone(meeting.timezone);
        if (typeof meeting.calendarId === 'string') setCalendarId(meeting.calendarId);
        if (typeof meeting.calendlySchedulingUrl === 'string') {
          setCalendlySchedulingUrl(meeting.calendlySchedulingUrl);
        }
        if (typeof meeting.hasGoogleAccessToken === 'boolean') {
          setHasGoogleAccessToken(meeting.hasGoogleAccessToken);
        }
        if (typeof meeting.hasZoomAccessToken === 'boolean') {
          setHasZoomAccessToken(meeting.hasZoomAccessToken);
        }
      }
      setLoading(false);
    })();
  }, []);

  async function startOAuthConnect(provider: 'google' | 'zoom') {
    setError('');
    setConnectingProvider(provider);

    const cleanUrl = window.location.origin + window.location.pathname;
    const returnTo = `${cleanUrl}?oauth=${provider}_connected`;
    const res = await fetchBackend(`/api/business/me/integrations/${provider}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnTo }),
    });

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? `Failed to start ${provider} OAuth`);
      setConnectingProvider(null);
      return;
    }

    const json = (await res.json()) as { data?: { authUrl?: string } };
    const authUrl = json.data?.authUrl;
    if (!authUrl) {
      setError(`Missing ${provider} authorization URL`);
      setConnectingProvider(null);
      return;
    }

    window.location.href = authUrl;
  }

  async function disconnectProvider(provider: 'google' | 'zoom') {
    setError('');
    const res = await fetchBackend(`/api/business/me/integrations/${provider}/disconnect`, {
      method: 'POST',
    });

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? `Failed to disconnect ${provider}`);
      return;
    }

    if (provider === 'google') {
      setHasGoogleAccessToken(false);
      if (meetingProvider === 'google') setMeetingProvider('none');
    }
    if (provider === 'zoom') {
      setHasZoomAccessToken(false);
      if (meetingProvider === 'zoom') setMeetingProvider('none');
    }
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  function toggleSkill(key: string) {
    setEnabledSkills((prev) =>
      prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key]
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSaving(true);

    const domains = allowedDomains
      .split('\n')
      .map((domain) => domain.trim())
      .filter(Boolean);

    for (const domain of domains) {
      try {
        new URL(domain);
      } catch {
        setError(`Invalid URL: ${domain}`);
        setSaving(false);
        return;
      }
    }

    const res = await fetchBackend('/api/business/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabledSkills,
        allowedDomains: domains,
        meetingIntegration: {
          provider: meetingProvider,
          timezone: meetingTimezone || undefined,
          calendarId: meetingProvider === 'google' ? calendarId || 'primary' : undefined,
          calendlySchedulingUrl:
            meetingProvider === 'calendly' ? calendlySchedulingUrl || undefined : undefined,
        },
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

  if (loading) {
    return <div className="p-8 text-sm text-gray-400 dark:text-slate-500">Loading...</div>;
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">Skills</h1>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-8">
        Configure which tools your assistant can use. This page is designed to scale as more skills are added.
      </p>

      <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
        {error && <Alert type="error" message={error} />}
        {success && <Alert type="success" message="Skills saved." />}

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-0.5">Agent skills</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
            Enable the tools that make sense for your use-case. Changes take effect immediately.
          </p>

          <div className="space-y-3">
            {SKILLS.map((skill) => {
              const active = enabledSkills.includes(skill.key);
              return (
                <div
                  key={skill.key}
                  className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                    active
                      ? 'border-brand-700/50 bg-slate-800'
                      : 'border-slate-700 bg-slate-900/70'
                  }`}
                >
                  <span className="text-2xl mt-0.5 shrink-0">{skill.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${active ? 'text-brand-300' : 'text-slate-100'}`}>
                      {skill.title}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{skill.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleSkill(skill.key)}
                    className={`relative shrink-0 mt-0.5 h-6 w-11 rounded-full transition-colors ${
                      active ? 'bg-brand-500' : 'bg-slate-600'
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

        {enabledSkills.includes('meeting_scheduler') && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-0.5">Meeting integration</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Connect one provider so the agent can create meetings when a customer confirms a slot.
              </p>
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Provider</label>
              <select
                value={meetingProvider}
                onChange={(e) => setMeetingProvider(e.target.value as 'none' | 'google' | 'zoom' | 'calendly')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="none">Not connected</option>
                <option value="google">Google Calendar + Google Meet</option>
                <option value="zoom">Zoom</option>
                <option value="calendly">Calendly</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Timezone</label>
              <input
                type="text"
                value={meetingTimezone}
                onChange={(e) => setMeetingTimezone(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="UTC"
              />
            </div>

            {meetingProvider === 'google' && (
              <>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Google calendar ID</label>
                  <input
                    type="text"
                    value={calendarId}
                    onChange={(e) => setCalendarId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    placeholder="primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Google connection</label>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => startOAuthConnect('google')}
                      disabled={connectingProvider === 'google'}
                      className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50"
                    >
                      {connectingProvider === 'google'
                        ? 'Connecting...'
                        : hasGoogleAccessToken
                          ? 'Reconnect Google'
                          : 'Connect Google'}
                    </button>
                    {hasGoogleAccessToken && (
                      <button
                        type="button"
                        onClick={() => disconnectProvider('google')}
                        className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-200 hover:bg-slate-800"
                      >
                        Disconnect
                      </button>
                    )}
                    <span className="text-xs text-gray-500 dark:text-slate-400">
                      {hasGoogleAccessToken ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                </div>
              </>
            )}

            {meetingProvider === 'zoom' && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Zoom connection</label>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => startOAuthConnect('zoom')}
                    disabled={connectingProvider === 'zoom'}
                    className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50"
                  >
                    {connectingProvider === 'zoom'
                      ? 'Connecting...'
                      : hasZoomAccessToken
                        ? 'Reconnect Zoom'
                        : 'Connect Zoom'}
                  </button>
                  {hasZoomAccessToken && (
                    <button
                      type="button"
                      onClick={() => disconnectProvider('zoom')}
                      className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-200 hover:bg-slate-800"
                    >
                      Disconnect
                    </button>
                  )}
                  <span className="text-xs text-gray-500 dark:text-slate-400">
                    {hasZoomAccessToken ? 'Connected' : 'Not connected'}
                  </span>
                </div>
              </div>
            )}

            {meetingProvider === 'calendly' && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Calendly scheduling URL</label>
                <input
                  type="url"
                  value={calendlySchedulingUrl}
                  onChange={(e) => setCalendlySchedulingUrl(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="https://calendly.com/your-team/intro-call"
                />
              </div>
            )}
          </div>
        )}

        {enabledSkills.includes('firecrawl') && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-0.5">Allowed domains</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
              The Firecrawl tool may only scrape pages on these domains. Enter one full URL per line
              (e.g. <code className="bg-gray-100 px-1 rounded dark:bg-slate-800">https://docs.example.com</code>).
            </p>
            <textarea
              value={allowedDomains}
              onChange={(e) => setAllowedDomains(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none transition dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
    </div>
  );
}

function Alert({ type, message }: { type: 'error' | 'success'; message: string }) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        type === 'error'
          ? 'bg-red-50 border-red-200 text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
          : 'bg-green-50 border-green-200 text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300'
      }`}
    >
      {message}
    </div>
  );
}