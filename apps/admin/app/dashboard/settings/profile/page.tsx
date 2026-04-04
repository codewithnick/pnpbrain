'use client';

/**
 * Settings → Profile
 * Business identity, hosting visibility, and integration API credentials.
 */

import { useEffect, useMemo, useState } from 'react';
import { fetchBackend, getBackendUrl } from '@/lib/supabase';
import { fetchAgents, resolveActiveAgent } from '@/lib/agents';

function slugify(v: string) {
  return v
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .slice(0, 40);
}

interface BusinessMeResponse {
  data?: {
    id?: string;
    name?: string;
    slug?: string;
    description?: string;
    allowedDomains?: string[];
    agentApiKey?: string | null;
  };
  error?: string;
}

export default function ProfileSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rotatingKey, setRotatingKey] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasActiveAgent, setHasActiveAgent] = useState(true);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [originalSlug, setOriginalSlug] = useState('');
  const [description, setDescription] = useState('');
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [agentApiKey, setAgentApiKey] = useState('');

  useEffect(() => {
    (async () => {
      const agents = await fetchAgents().catch(() => []);
      const active = resolveActiveAgent(agents);
      setHasActiveAgent(Boolean(active));

      const res = await fetchBackend('/api/business/me');
      const json = (await res.json().catch(() => ({}))) as BusinessMeResponse;
      const d = json.data;

      if (res.ok && d) {
        if (typeof d.name === 'string') setName(d.name);
        if (typeof d.slug === 'string') {
          setSlug(d.slug);
          setOriginalSlug(d.slug);
        }
        if (typeof d.description === 'string') setDescription(d.description);
        if (Array.isArray(d.allowedDomains)) setAllowedDomains(d.allowedDomains);
        if (typeof d.agentApiKey === 'string') setAgentApiKey(d.agentApiKey);
      }

      setLoading(false);
    })();
  }, []);

  const integrationCurl = useMemo(() => {
    if (!agentApiKey) return '';
    return String.raw`curl -X POST "${getBackendUrl()}/api/agent/chat" \
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${agentApiKey}" \\
  -d '{"message":"Hello from our app"}'`;
  }, [agentApiKey]);

  const mcpEndpoint = useMemo(() => `${getBackendUrl()}/mcp`, []);

  const claudeDesktopConfig = useMemo(() => {
    if (!agentApiKey) return '';
    return JSON.stringify(
      {
        mcpServers: {
          'pnpbrain-agent': {
            command: 'npx',
            args: ['mcp-remote', mcpEndpoint],
            env: { MCP_API_KEY: agentApiKey },
          },
        },
      },
      null,
      2
    );
  }, [agentApiKey, mcpEndpoint]);

  const vscodeMcpConfig = useMemo(() => {
    const vscodeApiKey = agentApiKey || '${input:pnpbrain-api-key}';

    return JSON.stringify(
      {
        inputs: [
          {
            type: 'promptString',
            id: 'pnpbrain-api-key',
            description: 'PNPBrain MCP API key',
            password: true,
          },
        ],
        servers: {
          pnpbrainAgent: {
            type: 'http',
            url: mcpEndpoint,
            headers: {
              'x-api-key': vscodeApiKey,
            },
          },
        },
      },
      null,
      2
    );
  }, [agentApiKey, mcpEndpoint]);

  const mcpCurl = useMemo(() => {
    if (!agentApiKey) return '';
    return String.raw`curl -X POST "${mcpEndpoint}" \
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -H "x-api-key: ${agentApiKey}" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`;
  }, [agentApiKey, mcpEndpoint]);

  async function copyApiKey() {
    if (!agentApiKey) return;
    await navigator.clipboard.writeText(agentApiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function rotateApiKey() {
    if (!hasActiveAgent) {
      setError('Select an active agent before rotating an API key.');
      return;
    }

    setError('');
    setRotatingKey(true);

    const res = await fetchBackend('/api/business/me/api-key/rotate', { method: 'POST' });
    const json = (await res.json().catch(() => ({}))) as { data?: { agentApiKey?: string }; error?: string };

    setRotatingKey(false);

    if (!res.ok || !json.data?.agentApiKey) {
      setError(json.error ?? 'Failed to rotate API key');
      return;
    }

    setAgentApiKey(json.data.agentApiKey);
    setShowApiKey(true);
  }

  async function handleSave(e: Parameters<NonNullable<React.ComponentProps<'form'>['onSubmit']>>[0]) {
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

    if (res.status === 409) {
      setError('That slug is already taken.');
      return;
    }

    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? 'Save failed');
      return;
    }

    setOriginalSlug(slug);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  if (loading) return <div className="text-sm text-gray-400 dark:text-slate-500 py-8">Loading…</div>;

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
      {error && <Alert type="error" message={error} />}
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

      <Card title="Public chat URL" description="Your customers will visit this URL to chat with your assistant.">
        <div className="flex items-center gap-0 rounded-lg border border-gray-300 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 transition overflow-hidden dark:border-slate-700">
          <span className="px-3 py-2.5 text-sm text-gray-400 bg-gray-50 border-r border-gray-300 shrink-0 select-none dark:bg-slate-900 dark:border-slate-700 dark:text-slate-500">
            pnpbrain.com/
          </span>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            required
            pattern="[a-z0-9\-]+"
            className="flex-1 px-3 py-2.5 text-sm bg-white focus:outline-none font-mono dark:bg-slate-950 dark:text-slate-100"
            placeholder="acme-corp"
          />
        </div>
        {slug && slug !== originalSlug && (
          <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-300">
            ⚠ Changing your slug will break any shared links using the old URL.
          </p>
        )}
      </Card>

      <Card title="Business description" description="Internal business notes. Not shown to customers.">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className={`${fieldCls} resize-none`}
          placeholder="We are an e-commerce platform specialising in eco-friendly home goods..."
          maxLength={500}
        />
        <p className="mt-1 text-xs text-right text-gray-400 dark:text-slate-500">{description.length}/500</p>
      </Card>

      <Card title="Hosted on" description="Where your agent is currently allowed to run.">
        {allowedDomains.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {allowedDomains.map((domain) => (
              <span
                key={domain}
                className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200"
              >
                {domain}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            No domains configured yet. Add allowed domains in Skills to define where your agent is hosted.
          </p>
        )}
      </Card>

      <Card title="Integration API key" description="Use this key to integrate your agent into external systems.">
        {!hasActiveAgent && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
            No active agent selected. Create/select an agent in Agents before generating an API key.
          </div>
        )}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type={showApiKey ? 'text' : 'password'}
              readOnly
              value={agentApiKey}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-mono text-slate-100"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((v) => !v)}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
            >
              {showApiKey ? 'Hide' : 'Show'}
            </button>
            <button
              type="button"
              onClick={copyApiKey}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              disabled={rotatingKey || !hasActiveAgent}
              onClick={rotateApiKey}
              className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {rotatingKey ? 'Rotating...' : 'Rotate'}
            </button>
          </div>

          <p className="text-xs text-slate-400">Rotating revokes the previous key immediately.</p>

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <p className="mb-2 text-xs font-medium text-slate-300">Use with REST</p>
            <pre className="overflow-x-auto text-xs text-slate-200">
              <code>{integrationCurl}</code>
            </pre>
          </div>
        </div>
      </Card>

      <Card
        title="MCP Server"
        description="Connect any MCP-compatible AI client (Claude Desktop, Cursor, GitHub Copilot, Windsurf, etc.) directly to your agent."
      >
        <div className="space-y-4">
          {/* Endpoint */}
          <div>
            <p className="mb-1 text-xs font-medium text-slate-300">Endpoint</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={mcpEndpoint}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-mono text-slate-100"
              />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(mcpEndpoint)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 shrink-0"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Auth */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
            <span className="font-medium text-slate-200">Authentication:</span>{' '}
            add an <code className="text-indigo-400">x-api-key: &lt;your-api-key&gt;</code> header to every request.
            MCP HTTP clients should also send <code className="text-indigo-400">Accept: application/json, text/event-stream</code>.
          </div>

          {/* Claude Desktop */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <p className="mb-2 text-xs font-medium text-slate-300">Claude Desktop — <code>~/Library/Application Support/Claude/claude_desktop_config.json</code></p>
            <pre className="overflow-x-auto text-xs text-slate-200 whitespace-pre-wrap">
              <code>{claudeDesktopConfig}</code>
            </pre>
          </div>

          {/* VS Code */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <p className="mb-2 text-xs font-medium text-slate-300">VS Code — <code>.vscode/mcp.json</code> or user profile <code>mcp.json</code></p>
            <pre className="overflow-x-auto text-xs text-slate-200 whitespace-pre-wrap">
              <code>{vscodeMcpConfig}</code>
            </pre>
            <p className="mt-2 text-xs text-slate-400">
              This snippet includes your current API key directly. Replace it with <code>${'{input:pnpbrain-api-key}'}</code> if you prefer VS Code to prompt for the key at runtime.
            </p>
          </div>

          {/* VS Code agent */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <p className="mb-2 text-xs font-medium text-slate-300">VS Code custom agent</p>
            <p className="text-xs text-slate-400">
              Add a workspace agent at <code>.github/agents/pnpbrain.agent.md</code> and reference the <code>pnpbrainAgent</code> MCP server in its tool list to give Copilot a dedicated PNPBrain chat mode.
            </p>
          </div>

          {/* Test with cURL */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <p className="mb-2 text-xs font-medium text-slate-300">Test with cURL — list available tools</p>
            <pre className="overflow-x-auto text-xs text-slate-200">
              <code>{mcpCurl}</code>
            </pre>
          </div>

          {/* Available tools */}
          <div>
            <p className="mb-2 text-xs font-medium text-slate-300">Available tools</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { name: 'chat', desc: 'Send a message to the agent and get a full reply' },
                { name: 'list_conversations', desc: 'List recent conversation threads' },
                { name: 'get_conversation', desc: 'Fetch all messages in a thread' },
                { name: 'list_knowledge', desc: 'List indexed knowledge documents' },
                { name: 'add_knowledge_url', desc: 'Crawl a URL and add it to the knowledge base' },
              ].map((t) => (
                <div key={t.name} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                  <code className="text-xs font-semibold text-indigo-400">{t.name}</code>
                  <p className="mt-0.5 text-xs text-slate-400">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition"
        >
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}

const fieldCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 transition dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

function Card({
  title,
  description,
  children,
}: Readonly<{ title: string; description?: string; children: React.ReactNode }>) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-0.5">{title}</h3>
      {description && <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">{description}</p>}
      {children}
    </div>
  );
}

function Alert({ type, message }: Readonly<{ type: 'error' | 'success'; message: string }>) {
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
