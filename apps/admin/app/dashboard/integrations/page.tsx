'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchBackend } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Integration registry — add a new entry here to add a new integration card.
// No other code needs to change.
// ---------------------------------------------------------------------------

interface ConfigField {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'url';
}

interface IntegrationDef {
  id: string;
  name: string;
  description: string;
  oauthEnabled: boolean;
  supportsDefault: boolean;
  configFields: ConfigField[];
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'google',
    name: 'Google Calendar & Meet',
    description:
      'Create calendar events and Google Meet links automatically when a customer confirms a slot.',
    oauthEnabled: true,
    supportsDefault: true,
    configFields: [
      { key: 'calendarId', label: 'Calendar ID', placeholder: 'primary' },
      { key: 'timezone', label: 'Timezone', placeholder: 'UTC' },
    ],
  },
  {
    id: 'zoom',
    name: 'Zoom',
    description: 'Schedule Zoom meetings directly from the conversation when customers are ready.',
    oauthEnabled: true,
    supportsDefault: true,
    configFields: [{ key: 'timezone', label: 'Timezone', placeholder: 'UTC' }],
  },
  {
    id: 'calendly',
    name: 'Calendly',
    description: 'Share your Calendly booking link so customers can self-schedule anytime.',
    oauthEnabled: false,
    supportsDefault: true,
    configFields: [
      {
        key: 'schedulingUrl',
        label: 'Scheduling URL',
        placeholder: 'https://calendly.com/your-link',
        type: 'url',
      },
      { key: 'timezone', label: 'Timezone', placeholder: 'UTC' },
    ],
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    description: 'Create support tickets when the agent needs to escalate a conversation.',
    oauthEnabled: false,
    supportsDefault: false,
    configFields: [
      { key: 'subdomain', label: 'Subdomain', placeholder: 'your-company' },
      { key: 'supportEmail', label: 'Support Email', placeholder: 'support@company.com' },
      { key: 'apiToken', label: 'API Token', placeholder: 'Zendesk API token' },
    ],
  },
  {
    id: 'freshdesk',
    name: 'Freshdesk',
    description: 'Create support tickets in Freshdesk for escalated customer requests.',
    oauthEnabled: false,
    supportsDefault: false,
    configFields: [
      { key: 'domain', label: 'Domain', placeholder: 'your-company.freshdesk.com' },
      { key: 'apiToken', label: 'API Key', placeholder: 'Freshdesk API key' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Types from server
// ---------------------------------------------------------------------------

interface IntegrationStatus {
  provider: string;
  isDefault: boolean;
  connected: boolean;
  hasRefreshToken: boolean;
  config: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

function Alert({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <div
      className={`rounded-lg px-4 py-3 text-sm ${
        type === 'success'
          ? 'bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-400'
          : 'bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-400'
      }`}
    >
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integration card
// ---------------------------------------------------------------------------

interface IntegrationCardProps {
  def: IntegrationDef;
  status: IntegrationStatus | undefined;
  connecting: boolean;
  onConnect: (provider: string) => Promise<void>;
  onDisconnect: (provider: string) => Promise<void>;
  onSaveConfig: (
    provider: string,
    config: Record<string, string>,
    isDefault: boolean
  ) => Promise<string | undefined>;
}

function IntegrationCard({
  def,
  status,
  connecting,
  onConnect,
  onDisconnect,
  onSaveConfig,
}: IntegrationCardProps) {
  const connected = status?.connected ?? false;
  const [localConfig, setLocalConfig] = useState<Record<string, string>>(status?.config ?? {});
  const [isDefault, setIsDefault] = useState(status?.isDefault ?? false);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');
  const [localSuccess, setLocalSuccess] = useState(false);

  // Sync when server status loads or changes.
  useEffect(() => {
    if (status) {
      setLocalConfig(status.config);
      setIsDefault(status.isDefault);
    }
  }, [status]);

  const handleSave = async () => {
    setSaving(true);
    setLocalError('');
    setLocalSuccess(false);
    const err = await onSaveConfig(def.id, localConfig, isDefault);
    setSaving(false);
    if (err) {
      setLocalError(err);
    } else {
      setLocalSuccess(true);
      setTimeout(() => setLocalSuccess(false), 3000);
    }
  };

  const showConfigPanel = connected || !def.oauthEnabled;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 p-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">{def.name}</h3>
            {connected && (
              <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                Connected
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{def.description}</p>
        </div>

        {def.oauthEnabled && (
          <div className="shrink-0">
            {connected ? (
              <button
                onClick={() => onDisconnect(def.id)}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => onConnect(def.id)}
                disabled={connecting}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {connecting ? 'Connecting…' : 'Connect'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Config panel — shown when connected (OAuth) or always (non-OAuth) */}
      {showConfigPanel && (
        <div className="border-t border-gray-100 p-6 pt-4 space-y-3 dark:border-slate-800">
          {localError && <Alert type="error" message={localError} />}
          {localSuccess && <Alert type="success" message="Saved." />}

          {def.configFields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">
                {field.label}
              </label>
              <input
                type={field.type ?? 'text'}
                value={localConfig[field.key] ?? ''}
                onChange={(e) =>
                  setLocalConfig((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                placeholder={field.placeholder}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          ))}

          {def.supportsDefault && (
            <div className="flex items-center gap-3 pt-1">
              <input
                id={`default-${def.id}`}
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <label
                htmlFor={`default-${def.id}`}
                className="text-xs text-gray-600 dark:text-slate-300"
              >
                Use as default meeting provider
              </label>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IntegrationsPage() {
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState('');
  const [globalSuccess, setGlobalSuccess] = useState('');
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetchBackend('/api/business/me');
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const json = (await res.json()) as {
        data?: { integrations?: IntegrationStatus[] };
      };
      setIntegrations(json.data?.integrations ?? []);

      const oauthStatus = new URLSearchParams(window.location.search).get('oauth');
      if (oauthStatus?.endsWith('_connected')) {
        const provider = oauthStatus.replace('_connected', '');
        setGlobalSuccess(`${provider.charAt(0).toUpperCase() + provider.slice(1)} connected successfully.`);
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => setGlobalSuccess(''), 4000);
      }

      setLoading(false);
    })();
  }, []);

  const handleConnect = useCallback(async (provider: string) => {
    setGlobalError('');
    setConnectingProvider(provider);
    const returnTo = `${window.location.origin}${window.location.pathname}?oauth=${provider}_connected`;
    const res = await fetchBackend(`/api/business/me/integrations/${provider}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnTo }),
    });

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setGlobalError(json.error ?? `Failed to start ${provider} connect.`);
      setConnectingProvider(null);
      return;
    }

    const json = (await res.json()) as { data?: { authUrl?: string } };
    const authUrl = json.data?.authUrl;
    if (!authUrl) {
      setGlobalError(`Missing auth URL for ${provider}.`);
      setConnectingProvider(null);
      return;
    }

    window.location.href = authUrl;
  }, []);

  const handleDisconnect = useCallback(async (provider: string) => {
    setGlobalError('');
    const res = await fetchBackend(`/api/business/me/integrations/${provider}/disconnect`, {
      method: 'POST',
    });

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setGlobalError(json.error ?? `Failed to disconnect ${provider}.`);
      return;
    }

    setIntegrations((prev) =>
      prev.map((s) =>
        s.provider === provider
          ? { ...s, connected: false, isDefault: false, hasRefreshToken: false }
          : s
      )
    );
    setGlobalSuccess(`${provider} disconnected.`);
    setTimeout(() => setGlobalSuccess(''), 3000);
  }, []);

  const handleSaveConfig = useCallback(
    async (
      provider: string,
      config: Record<string, string>,
      isDefault: boolean
    ): Promise<string | undefined> => {
      const res = await fetchBackend(`/api/business/me/integrations/${provider}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, isDefault }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        return json.error ?? 'Save failed.';
      }

      setIntegrations((prev) => {
        const def = INTEGRATIONS.find((item) => item.id === provider);
        const existing = prev.find((s) => s.provider === provider);
        const hasAllConfig =
          !!def &&
          def.configFields.every((field) => {
            const value = config[field.key];
            return typeof value === 'string' && value.trim().length > 0;
          });
        const updated: IntegrationStatus = {
          provider,
          isDefault,
          connected: hasAllConfig || (existing?.connected ?? false),
          hasRefreshToken: existing?.hasRefreshToken ?? false,
          config,
        };
        const rest = prev
          .filter((s) => s.provider !== provider)
          .map((s) => (isDefault ? { ...s, isDefault: false } : s));
        return [...rest, updated];
      });

      return undefined;
    },
    []
  );

  if (loading) {
    return <div className="p-8 text-sm text-gray-400 dark:text-slate-500">Loading…</div>;
  }

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Integrations</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Connect your tools so the agent can book meetings, escalate conversations, and take
          action on behalf of your business.
        </p>
      </div>

      {globalError && <Alert type="error" message={globalError} />}
      {globalSuccess && <Alert type="success" message={globalSuccess} />}

      <div className="space-y-4">
        {INTEGRATIONS.map((def) => (
          <IntegrationCard
            key={def.id}
            def={def}
            status={integrations.find((s) => s.provider === def.id)}
            connecting={connectingProvider === def.id}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onSaveConfig={handleSaveConfig}
          />
        ))}
      </div>
    </div>
  );
}


