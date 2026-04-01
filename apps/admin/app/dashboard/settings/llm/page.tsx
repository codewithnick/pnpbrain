'use client';

/**
 * Settings → LLM
 * Per-business language model configuration.
 */

import { useEffect, useState } from 'react';
import { fetchBackend } from '@/lib/supabase';

const PROVIDERS = [
  { value: 'ollama',     label: 'Ollama', description: 'Self-hosted — runs on your own machine or server. Free.' },
  { value: 'openai',     label: 'OpenAI', description: 'Hosted API — GPT-4o, GPT-4o mini, etc.' },
  { value: 'anthropic',  label: 'Anthropic', description: 'Hosted API — Claude 3.5 Haiku / Sonnet.' },
];

const DEFAULT_MODELS: Record<string, string> = {
  ollama:    'llama3.1:8b',
  openai:    'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-20241022',
};

const fieldCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 transition';

export default function LlmSettingsPage() {
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState('');
  const [hasKey, setHasKey]       = useState(false);

  const [provider, setProvider]   = useState('ollama');
  const [model, setModel]         = useState('llama3.1:8b');
  const [apiKey, setApiKey]       = useState('');
  const [baseUrl, setBaseUrl]     = useState('');

  useEffect(() => {
    (async () => {
      const res = await fetchBackend('/api/business/me');
      if (!res.ok) { setLoading(false); return; }
      const json = (await res.json()) as { data?: Record<string, unknown> };
      const d = json.data;
      if (!d) { setLoading(false); return; }
      if (typeof d.llmProvider === 'string') setProvider(d.llmProvider);
      if (typeof d.llmModel    === 'string') setModel(d.llmModel);
      if (typeof d.llmBaseUrl  === 'string') setBaseUrl(d.llmBaseUrl ?? '');
      if (typeof d.hasLlmApiKey === 'boolean') setHasKey(d.hasLlmApiKey);
      setLoading(false);
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSaving(true);

    const body: Record<string, unknown> = { llmProvider: provider, llmModel: model };
    if (provider === 'ollama') body.llmBaseUrl = baseUrl || null;
    if ((provider === 'openai' || provider === 'anthropic') && apiKey) body.llmApiKey = apiKey;

    const res = await fetchBackend('/api/business/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);

    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? 'Save failed');
      return;
    }

    if (apiKey) { setApiKey(''); setHasKey(true); }
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  if (loading) return <div className="text-sm text-gray-400 py-8">Loading…</div>;

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-xl">
      {error   && <Alert type="error"   message={error} />}
      {success && <Alert type="success" message="LLM configuration saved." />}

      {/* Provider cards */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Provider</h3>
        <p className="text-xs text-gray-500 mb-4">The AI service that powers your agent's responses.</p>
        <div className="space-y-3">
          {PROVIDERS.map((p) => {
            const active = provider === p.value;
            return (
              <button
                type="button"
                key={p.value}
                onClick={() => {
                  setProvider(p.value);
                  setModel(DEFAULT_MODELS[p.value] ?? '');
                }}
                className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                  active ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex-1">
                  <p className={`text-sm font-medium ${active ? 'text-brand-700' : 'text-gray-900'}`}>{p.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                </div>
                <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 ${
                  active ? 'bg-brand-500 border-brand-500' : 'border-gray-300'
                }`}>
                  {active && <span className="text-white text-xs">✓</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Model name */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Model</h3>
        <p className="text-xs text-gray-500 mb-3">
          {provider === 'ollama'
            ? 'Any model tag pulled in Ollama (e.g. llama3.1:8b, mistral, gemma3:4b).'
            : provider === 'openai'
            ? 'Any OpenAI model: gpt-4o, gpt-4o-mini, gpt-4-turbo…'
            : 'Any Anthropic model: claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022…'}
        </p>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          required
          className={`${fieldCls} font-mono`}
          placeholder={DEFAULT_MODELS[provider]}
        />
      </div>

      {/* Ollama base URL */}
      {provider === 'ollama' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Ollama base URL</h3>
          <p className="text-xs text-gray-500 mb-3">
            Leave blank to use the server's default Ollama instance.
          </p>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className={`${fieldCls} font-mono`}
            placeholder="http://localhost:11434"
          />
        </div>
      )}

      {/* API key */}
      {(provider === 'openai' || provider === 'anthropic') && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-0.5">API key</h3>
          <p className="text-xs text-gray-500 mb-3">
            {hasKey
              ? '✓ A key is stored. Enter a new one to replace it.'
              : 'Required for this provider. Stored encrypted and never shown again.'}
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className={`${fieldCls} font-mono`}
            placeholder={provider === 'openai' ? 'sk-…' : 'sk-ant-…'}
            autoComplete="off"
          />
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : 'Save LLM config'}
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
