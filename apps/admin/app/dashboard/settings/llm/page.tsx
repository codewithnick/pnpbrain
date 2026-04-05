'use client';

/**
 * Settings → LLM
 * Per-business language model configuration.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchBackend } from '@/lib/supabase';
import { fetchAgents, resolveActiveAgent } from '@/lib/agents';

const PROVIDERS = [
  { value: 'huggingface', label: 'Hugging Face', description: 'Hosted router API — default recommended option for chat and RAG.' },
  { value: 'openrouter', label: 'OpenRouter', description: 'Hosted router API — unified access to models across providers.' },
  { value: 'openai',     label: 'OpenAI', description: 'Hosted API — GPT-4o, GPT-4o mini, etc.' },
  { value: 'anthropic',  label: 'Anthropic', description: 'Hosted API — Claude 3.5 Haiku / Sonnet.' },
  { value: 'gemini',     label: 'Google Gemini', description: 'Hosted API — Gemini 1.5 / 2.0 model family.' },
  { value: 'deepseek',   label: 'DeepSeek', description: 'Hosted API — DeepSeek Chat and Reasoner models.' },
  { value: 'ollama',     label: 'Ollama', description: 'Local legacy option — only use when you explicitly want self-hosted chat.' },
];

const DEFAULT_MODELS: Record<string, string> = {
  ollama:    'llama3.1:8b',
  openai:    'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-20241022',
  gemini: 'gemini-1.5-flash',
  deepseek: 'deepseek-chat',
  huggingface: 'meta-llama/Llama-3.1-8B-Instruct',
  openrouter: 'openai/gpt-4o-mini',
};

const fieldCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 transition dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

export default function LlmSettingsPage() {
  const [agentId, setAgentId]       = useState<string | null>(null);
  const [hasActiveAgent, setHasActiveAgent] = useState(true);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState('');
  const [hasKey, setHasKey]       = useState(false);

  const [provider, setProvider]   = useState('huggingface');
  const [model, setModel]         = useState('meta-llama/Llama-3.1-8B-Instruct');
  const [apiKey, setApiKey]       = useState('');
  const [baseUrl, setBaseUrl]     = useState('');

  const providerSupportsApiKey = provider !== 'ollama';
  const providerSupportsBaseUrl = provider === 'ollama' || provider === 'deepseek' || provider === 'huggingface' || provider === 'openrouter';

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
        if (typeof active.llmProvider === 'string') setProvider(active.llmProvider);
        if (typeof active.llmModel === 'string') setModel(active.llmModel);
        if (typeof active.llmBaseUrl === 'string') setBaseUrl(active.llmBaseUrl ?? '');
        setHasKey(Boolean(active.llmApiKey));
        setLoading(false);
      } catch {
        setError('Failed to load agent configuration.');
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSaving(true);

    const body: Record<string, unknown> = { llmProvider: provider, llmModel: model };
    if (providerSupportsBaseUrl) body.llmBaseUrl = baseUrl || null;
    if (providerSupportsApiKey && apiKey) body.llmApiKey = apiKey;

    if (!agentId) {
      setSaving(false);
      setError('No active agent selected.');
      return;
    }

    const res = await fetchBackend(`/api/agents/${agentId}`, {
      method: 'PATCH',
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

  if (loading) return <div className="text-sm text-gray-400 dark:text-slate-500 py-8">Loading…</div>;

  if (!hasActiveAgent) {
    return (
      <div className="max-w-xl rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">No active agent selected</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">
          Create an agent first, then select it to configure LLM settings.
        </p>
        <Link href="/dashboard/agents" className="mt-4 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Go to Agents
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-xl">
      {error   && <Alert type="error"   message={error} />}
      {success && <Alert type="success" message="LLM configuration saved." />}

      {/* Provider cards */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-0.5">Provider</h3>
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">The AI service that powers your agent&apos;s responses.</p>
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
                  active ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-700' : 'border-gray-200 hover:border-gray-300 dark:border-slate-700 dark:hover:border-slate-600 dark:bg-slate-900/60'
                }`}
              >
                <div className="flex-1">
                  <p className={`text-sm font-medium ${active ? 'text-brand-700 dark:text-brand-200' : 'text-gray-900 dark:text-slate-100'}`}>{p.label}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{p.description}</p>
                </div>
                <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 ${
                  active ? 'bg-brand-500 border-brand-500' : 'border-gray-300 dark:border-slate-600'
                }`}>
                  {active && <span className="text-white text-xs">✓</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Model name */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-0.5">Model</h3>
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
          {provider === 'ollama'
            ? 'Any model tag pulled in Ollama (e.g. llama3.1:8b, mistral, gemma3:4b).'
            : provider === 'openai'
            ? 'Any OpenAI model: gpt-4o, gpt-4o-mini, gpt-4-turbo…'
            : provider === 'anthropic'
            ? 'Any Anthropic model: claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022…'
            : provider === 'gemini'
            ? 'Any Gemini model: gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash…'
            : provider === 'deepseek'
            ? 'DeepSeek models: deepseek-chat, deepseek-reasoner…'
            : provider === 'huggingface'
            ? 'Hugging Face router model IDs, e.g. meta-llama/Llama-3.1-8B-Instruct.'
            : 'OpenRouter model IDs, e.g. openai/gpt-4o-mini, anthropic/claude-3.5-sonnet.'}
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

      {/* Provider base URL */}
      {providerSupportsBaseUrl && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-0.5">Base URL</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
            {provider === 'ollama'
              ? "Leave blank to use the server's default Ollama instance."
              : provider === 'deepseek'
              ? "Leave blank to use the default DeepSeek API endpoint."
                : provider === 'huggingface'
                ? 'Leave blank to use the default Hugging Face router endpoint.'
                : 'Leave blank to use the default OpenRouter endpoint.'}
          </p>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className={`${fieldCls} font-mono`}
            placeholder={
              provider === 'ollama'
                ? 'http://localhost:11434'
                : provider === 'deepseek'
                ? 'https://api.deepseek.com/v1'
                : provider === 'huggingface'
                ? 'https://router.huggingface.co/v1'
                : 'https://openrouter.ai/api/v1'
            }
          />
        </div>
      )}

      {/* API key */}
      {providerSupportsApiKey && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-0.5">API key</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
            {hasKey
              ? '✓ A key is stored. Enter a new one to replace it.'
              : 'Required for this provider. Stored encrypted and never shown again.'}
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className={`${fieldCls} font-mono`}
            placeholder={
              provider === 'openai'
                ? 'sk-...'
                : provider === 'anthropic'
                ? 'sk-ant-...'
                : provider === 'gemini'
                ? 'AIza... or Gemini API key'
                : provider === 'deepseek'
                ? 'sk-...'
                : provider === 'huggingface'
                ? 'hf_...'
                : 'sk-or-v1-...'
            }
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
      type === 'error' ? 'bg-red-50 border-red-200 text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300' : 'bg-green-50 border-green-200 text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300'
    }`}>{message}</div>
  );
}
