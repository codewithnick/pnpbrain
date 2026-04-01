'use client';

/**
 * Onboarding page — shown after a business signs up.
 *
 * A 4-step wizard that guides the business through:
 *  1. Business profile (name, description)
 *  2. LLM configuration
 *  3. Skills
 *  4. Widget theme + preview
 *
 * All steps call PUT /api/business/me to persist changes incrementally.
 * After step 4, redirects to /dashboard.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchBackend } from '@/lib/supabase';

async function saveBusiness(payload: Record<string, unknown>) {
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

const STEPS = ['Profile', 'LLM', 'Skills', 'Theme'] as const;
type Step = 0 | 1 | 2 | 3;

const LLM_OPTIONS = [
  { value: 'ollama',    label: 'Ollama (local / self-hosted)' },
  { value: 'openai',   label: 'OpenAI' },
  { value: 'anthropic',label: 'Anthropic' },
];

const SKILL_OPTIONS = [
  { key: 'calculator', label: '🔢 Calculator',    desc: 'Perform arithmetic in the conversation' },
  { key: 'datetime',   label: '🕐 Date & Time',   desc: 'Answer questions about dates and timezones' },
  { key: 'firecrawl',  label: '🕷️ Web Scraping',  desc: 'Crawl allowed domains and inject fresh content' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Step 0 — Profile
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Step 1 — LLM
  const [llmProvider, setLlmProvider] = useState('ollama');
  const [llmModel, setLlmModel] = useState('llama3.1:8b');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');

  // Step 2 — Skills
  const [enabledSkills, setEnabledSkills] = useState<string[]>(['calculator', 'datetime']);
  const [allowedDomains, setAllowedDomains] = useState('');

  // Step 3 — Theme
  const [primaryColor, setPrimaryColor] = useState('#6366f1');
  const [botName, setBotName] = useState('Assistant');
  const [welcomeMessage, setWelcomeMessage] = useState('Hi! How can I help you today?');
  const [widgetTheme, setWidgetTheme] = useState<'light' | 'dark'>('light');

  // Load existing business data on mount
  useEffect(() => {
    (async () => {
      const res = await fetchBackend('/api/business/me');
      if (!res.ok) return;
      const json = (await res.json()) as { data?: Record<string, unknown> };
      const d = json.data;
      if (!d) return;
      if (typeof d.name === 'string') setName(d.name);
      if (typeof d.description === 'string') setDescription(d.description);
      if (typeof d.llmProvider === 'string') setLlmProvider(d.llmProvider);
      if (typeof d.llmModel === 'string') setLlmModel(d.llmModel);
      if (typeof d.llmBaseUrl === 'string') setLlmBaseUrl(d.llmBaseUrl ?? '');
      if (Array.isArray(d.enabledSkills)) setEnabledSkills(d.enabledSkills as string[]);
      if (Array.isArray(d.allowedDomains)) setAllowedDomains((d.allowedDomains as string[]).join('\n'));
      if (typeof d.primaryColor === 'string') setPrimaryColor(d.primaryColor);
      if (typeof d.botName === 'string') setBotName(d.botName);
      if (typeof d.welcomeMessage === 'string') setWelcomeMessage(d.welcomeMessage);
      if (typeof d.widgetTheme === 'string') setWidgetTheme(d.widgetTheme as 'light' | 'dark');
    })();
  }, []);

  const goNext = useCallback(
    async (payload: Record<string, unknown>) => {
      setError('');
      setSaving(true);
      try {
        await saveBusiness(payload);
        if (step < 3) {
          setStep((s) => (s + 1) as Step);
        } else {
          router.push('/dashboard');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [step, router]
  );

  function toggleSkill(key: string) {
    setEnabledSkills((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center text-white font-bold text-xl">
            G
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Set up your AI assistant</h1>
          <p className="mt-2 text-gray-500">Configure everything — you can change it anytime from Settings.</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                  i < step
                    ? 'bg-brand-500 text-white'
                    : i === step
                    ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-500'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${i === step ? 'text-brand-700 font-medium' : 'text-gray-400'}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-300 mx-1" />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {error && (
            <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* ── Step 0: Profile ── */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">Business profile</h2>
                <p className="text-sm text-gray-500">
                  This information helps your AI agent respond as a representative of your company.
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Business description
                  <span className="ml-2 font-normal text-gray-400">(shown to the agent as context)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none"
                  placeholder="We are an e-commerce platform specialising in eco-friendly home goods…"
                />
              </div>

              <StepFooter step={step} setStep={setStep} saving={saving} onNext={() => goNext({ name, description })} />
            </div>
          )}

          {/* ── Step 1: LLM ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">Language model</h2>
                <p className="text-sm text-gray-500">
                  Choose which AI model powers your assistant. Ollama runs locally; OpenAI / Anthropic require API keys.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Provider</label>
                <select
                  value={llmProvider}
                  onChange={(e) => {
                    setLlmProvider(e.target.value);
                    setLlmModel(
                      e.target.value === 'openai'    ? 'gpt-4o-mini'
                      : e.target.value === 'anthropic' ? 'claude-3-5-haiku-20241022'
                      : 'llama3.1:8b'
                    );
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  {LLM_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Model name</label>
                <input
                  type="text"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder="llama3.1:8b"
                />
              </div>

              {llmProvider === 'ollama' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Ollama base URL
                    <span className="ml-2 font-normal text-gray-400">(leave blank to use server default)</span>
                  </label>
                  <input
                    type="url"
                    value={llmBaseUrl}
                    onChange={(e) => setLlmBaseUrl(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    placeholder="http://localhost:11434"
                  />
                </div>
              )}

              {(llmProvider === 'openai' || llmProvider === 'anthropic') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">API key</label>
                  <input
                    type="password"
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    placeholder={llmProvider === 'openai' ? 'sk-…' : 'sk-ant-…'}
                    autoComplete="off"
                  />
                  <p className="mt-1.5 text-xs text-gray-400">Stored encrypted. Never shown again after saving.</p>
                </div>
              )}

              <StepFooter
                step={step}
                setStep={setStep}
                saving={saving}
                onNext={() =>
                  goNext({
                    llmProvider,
                    llmModel,
                    ...(llmApiKey ? { llmApiKey } : {}),
                    ...(llmBaseUrl ? { llmBaseUrl } : {}),
                  })
                }
              />
            </div>
          )}

          {/* ── Step 2: Skills ── */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">Agent skills</h2>
                <p className="text-sm text-gray-500">
                  Skills give your agent superpowers. Enable the ones relevant to your use-case.
                </p>
              </div>

              <div className="space-y-3">
                {SKILL_OPTIONS.map((skill) => {
                  const active = enabledSkills.includes(skill.key);
                  return (
                    <button
                      key={skill.key}
                      type="button"
                      onClick={() => toggleSkill(skill.key)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                        active
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <span className="text-2xl">{skill.label.split(' ')[0]}</span>
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${active ? 'text-brand-700' : 'text-gray-900'}`}>
                          {skill.label.split(' ').slice(1).join(' ')}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{skill.desc}</p>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        active ? 'bg-brand-500 border-brand-500' : 'border-gray-300'
                      }`}>
                        {active && <span className="text-white text-xs">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>

              {enabledSkills.includes('firecrawl') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Allowed domains for web scraping
                    <span className="ml-2 font-normal text-gray-400">(one per line)</span>
                  </label>
                  <textarea
                    value={allowedDomains}
                    onChange={(e) => setAllowedDomains(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none"
                    placeholder={`https://docs.example.com\nhttps://support.example.com`}
                  />
                  <p className="mt-1.5 text-xs text-gray-400">
                    The Firecrawl tool can only scrape these exact domains. Leave blank to restrict all scraping.
                  </p>
                </div>
              )}

              <StepFooter
                step={step}
                setStep={setStep}
                saving={saving}
                onNext={() => {
                  const domains = allowedDomains
                    .split('\n')
                    .map((d) => d.trim())
                    .filter(Boolean);
                  goNext({ enabledSkills, allowedDomains: domains });
                }}
              />
            </div>
          )}

          {/* ── Step 3: Theme ── */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">Chat widget theme</h2>
                <p className="text-sm text-gray-500">
                  Customise how the chat looks at <span className="font-mono text-brand-600">gcfis.app/your-slug</span>.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Primary colour</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none"
                      placeholder="#6366f1"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Colour scheme</label>
                  <div className="flex gap-3">
                    {(['light', 'dark'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setWidgetTheme(t)}
                        className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                          widgetTheme === t
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {t === 'light' ? '☀️ Light' : '🌙 Dark'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Bot name</label>
                <input
                  type="text"
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  maxLength={60}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder="Assistant"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Welcome message</label>
                <input
                  type="text"
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  maxLength={200}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder="Hi! How can I help you today?"
                />
              </div>

              {/* Live preview */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Preview</p>
                <div
                  className={`rounded-2xl overflow-hidden border shadow-md max-w-xs mx-auto ${
                    widgetTheme === 'dark' ? 'bg-gray-900' : 'bg-white'
                  }`}
                >
                  {/* Header */}
                  <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: primaryColor }}>
                    <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">
                      {botName[0]?.toUpperCase() ?? 'A'}
                    </div>
                    <span className="text-white text-sm font-semibold">{botName}</span>
                  </div>
                  {/* Body */}
                  <div className={`px-4 py-4 text-sm ${widgetTheme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                    <div
                      className="rounded-2xl rounded-tl-sm px-4 py-2.5 inline-block max-w-[85%]"
                      style={{ backgroundColor: widgetTheme === 'dark' ? '#374151' : '#f3f4f6' }}
                    >
                      {welcomeMessage || 'Hi! How can I help you today?'}
                    </div>
                  </div>
                  {/* Input */}
                  <div className={`px-4 pb-4`}>
                    <div
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                        widgetTheme === 'dark'
                          ? 'border-gray-700 bg-gray-800'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <span className={`flex-1 text-xs ${widgetTheme === 'dark' ? 'text-gray-400' : 'text-gray-400'}`}>
                        Type a message…
                      </span>
                      <div
                        className="h-6 w-6 rounded-lg flex items-center justify-center text-white text-xs"
                        style={{ backgroundColor: primaryColor }}
                      >
                        ↑
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <StepFooter
                step={step}
                setStep={setStep}
                saving={saving}
                onNext={() => goNext({ primaryColor, botName, welcomeMessage, widgetTheme })}
                finalLabel="Finish setup →"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Shared step footer ──────────────────────────────────────────────────────── */

function StepFooter({
  step,
  setStep,
  saving,
  onNext,
  finalLabel = 'Save & continue →',
}: {
  step: Step;
  setStep: (s: Step) => void;
  saving: boolean;
  onNext: () => void;
  finalLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
      {step > 0 ? (
        <button
          type="button"
          onClick={() => setStep((step - 1) as Step)}
          className="text-sm text-gray-500 hover:text-gray-700 transition"
        >
          ← Back
        </button>
      ) : (
        <div />
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={saving}
        className="px-6 py-2.5 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition"
      >
        {saving ? 'Saving…' : step === 3 ? finalLabel : 'Save & continue →'}
      </button>
    </div>
  );
}
