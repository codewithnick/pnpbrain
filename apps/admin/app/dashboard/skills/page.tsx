'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchBackend } from '@/lib/supabase';
import { fetchAgents, resolveActiveAgent } from '@/lib/agents';
import type { CustomAgentSkill } from '@/lib/api-types';

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
  {
    key: 'support_escalation',
    icon: '🎫',
    title: 'Support Escalation',
    description:
      'Lets the assistant raise a support ticket to your human team when it cannot confidently answer.',
  },
  {
    key: 'http_requests',
    icon: '🌐',
    title: 'HTTP Requests (Axios)',
    description:
      'Lets the agent make safe outbound HTTP requests (GET/POST/etc.) to your allowed domains for basic API lookups and status checks.',
  },
  {
    key: 'web_preview',
    icon: '📰',
    title: 'Web Page Preview',
    description:
      'Fetches page metadata and a short text preview (title, description, snippet) from allowed domains.',
  },
  {
    key: 'iframe_embed',
    icon: '🖼️',
    title: 'Iframe Embed Generator',
    description:
      'Generates safe iframe embed markup for allowed URLs so the assistant can provide embeddable page snippets.',
  },
];

export default function SkillsPage() {
  type CustomSkillTestStatus = {
    state: 'pass' | 'fail';
    testedAt: number;
    statusCode?: number;
  };

  const [loading, setLoading] = useState(true);
  const [hasActiveAgent, setHasActiveAgent] = useState(true);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [skillSearch, setSkillSearch] = useState('');

  const [enabledSkills, setEnabledSkills] = useState<string[]>(['calculator', 'datetime']);
  const [allowedDomains, setAllowedDomains] = useState('');
  const [meetingProvider, setMeetingProvider] = useState<'none' | 'google' | 'zoom' | 'calendly'>('none');
  const [meetingTimezone, setMeetingTimezone] = useState('UTC');
  const [calendarId, setCalendarId] = useState('primary');
  const [calendlySchedulingUrl, setCalendlySchedulingUrl] = useState('');
  const [hasGoogleAccessToken, setHasGoogleAccessToken] = useState(false);
  const [hasZoomAccessToken, setHasZoomAccessToken] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<'google' | 'zoom' | null>(null);
  const [zendeskSubdomain, setZendeskSubdomain] = useState('');
  const [zendeskSupportEmail, setZendeskSupportEmail] = useState('');
  const [zendeskApiToken, setZendeskApiToken] = useState('');
  const [hasZendeskToken, setHasZendeskToken] = useState(false);
  const [freshdeskDomain, setFreshdeskDomain] = useState('');
  const [freshdeskApiKey, setFreshdeskApiKey] = useState('');
  const [hasFreshdeskToken, setHasFreshdeskToken] = useState(false);
  const [jiraSiteUrl, setJiraSiteUrl] = useState('');
  const [jiraProjectKey, setJiraProjectKey] = useState('');
  const [jiraIssueType, setJiraIssueType] = useState('Task');
  const [jiraSupportEmail, setJiraSupportEmail] = useState('');
  const [jiraApiToken, setJiraApiToken] = useState('');
  const [hasJiraToken, setHasJiraToken] = useState(false);
  const [supportProvider, setSupportProvider] = useState<'none' | 'zendesk' | 'freshdesk' | 'jira'>('none');
  const [customSkills, setCustomSkills] = useState<CustomAgentSkill[]>([]);
  const [creatingCustomSkill, setCreatingCustomSkill] = useState(false);
  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomKey, setNewCustomKey] = useState('');
  const [newCustomDescription, setNewCustomDescription] = useState('');
  const [newCustomWebhookUrl, setNewCustomWebhookUrl] = useState('');
  const [newCustomInputSchema, setNewCustomInputSchema] = useState('');
  const [testingCustomSkill, setTestingCustomSkill] = useState(false);
  const [customSkillTestResult, setCustomSkillTestResult] = useState('');
  const [testingCustomSkillId, setTestingCustomSkillId] = useState<string | null>(null);
  const [customSkillTestStatusById, setCustomSkillTestStatusById] = useState<Record<string, CustomSkillTestStatus>>({});

  async function loadCustomSkills(agentId: string) {
    const res = await fetchBackend(`/api/agents/${agentId}/custom-skills`);
    if (!res.ok) {
      return;
    }

    const json = (await res.json().catch(() => ({}))) as { data?: CustomAgentSkill[] };
    setCustomSkills(Array.isArray(json.data) ? json.data : []);
  }

  useEffect(() => {
    (async () => {
      const agents = await fetchAgents().catch(() => []);
      const active = resolveActiveAgent(agents);
      if (!active) {
        setHasActiveAgent(false);
        setLoading(false);
        return;
      }

      setHasActiveAgent(true);
      setActiveAgentId(active.id);
      await loadCustomSkills(active.id);

      // Load data directly from agent record (no extra business/me call)
      const data = active as unknown as Record<string, unknown>;

      const oauthStatus = new URLSearchParams(window.location.search).get('oauth');
      if (oauthStatus === 'google_connected' || oauthStatus === 'zoom_connected') {
        setSuccess(true);
      }

      if (Array.isArray(data['enabledSkills'])) setEnabledSkills(data['enabledSkills'] as string[]);
      if (Array.isArray(data['allowedDomains'])) setAllowedDomains((data['allowedDomains'] as string[]).join('\n'));
      if (Array.isArray(data['integrations'])) {
        const integrations = data['integrations'] as Array<Record<string, unknown>>;
        const zendesk = integrations.find((integration) => integration.provider === 'zendesk');
        if (zendesk) {
          setHasZendeskToken(Boolean(zendesk.connected));
          if (zendesk.config && typeof zendesk.config === 'object') {
            const config = zendesk.config as Record<string, unknown>;
            if (typeof config.subdomain === 'string') setZendeskSubdomain(config.subdomain);
            if (typeof config.supportEmail === 'string') setZendeskSupportEmail(config.supportEmail);
          }
        }
        const freshdesk = integrations.find((integration) => integration.provider === 'freshdesk');
        if (freshdesk) {
          setHasFreshdeskToken(Boolean(freshdesk.connected));
          if (freshdesk.config && typeof freshdesk.config === 'object') {
            const config = freshdesk.config as Record<string, unknown>;
            if (typeof config.domain === 'string') setFreshdeskDomain(config.domain);
          }
        }
        const jira = integrations.find((integration) => integration.provider === 'jira');
        if (jira) {
          setHasJiraToken(Boolean(jira.connected));
          if (jira.config && typeof jira.config === 'object') {
            const config = jira.config as Record<string, unknown>;
            if (typeof config.siteUrl === 'string') setJiraSiteUrl(config.siteUrl);
            if (typeof config.projectKey === 'string') setJiraProjectKey(config.projectKey);
            if (typeof config.issueType === 'string') setJiraIssueType(config.issueType);
            if (typeof config.supportEmail === 'string') setJiraSupportEmail(config.supportEmail);
          }
        }
        if (zendesk?.connected) setSupportProvider('zendesk');
        else if (freshdesk?.connected) setSupportProvider('freshdesk');
        else if (jira?.connected) setSupportProvider('jira');
      }
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

  async function createCustomSkill() {
    if (!activeAgentId) return;
    setError('');

    if (!newCustomName.trim()) {
      setError('Custom skill name is required');
      return;
    }

    if (!newCustomWebhookUrl.trim()) {
      setError('Custom skill webhook URL is required');
      return;
    }

    let parsedInputSchema: Record<string, unknown> | undefined;
    if (newCustomInputSchema.trim()) {
      try {
        const parsed = JSON.parse(newCustomInputSchema) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setError('Custom input schema must be a JSON object');
          return;
        }
        parsedInputSchema = parsed as Record<string, unknown>;
      } catch {
        setError('Custom input schema is not valid JSON');
        return;
      }
    }

    setCreatingCustomSkill(true);

    const res = await fetchBackend(`/api/agents/${activeAgentId}/custom-skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: newCustomKey.trim() || undefined,
        name: newCustomName.trim(),
        description: newCustomDescription.trim() || undefined,
        webhookUrl: newCustomWebhookUrl.trim(),
        inputSchema: parsedInputSchema,
        enabled: true,
      }),
    });

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? 'Failed to create custom skill');
      setCreatingCustomSkill(false);
      return;
    }

    const json = (await res.json()) as { data?: CustomAgentSkill };
    if (json.data) {
      const createdSkill = json.data as CustomAgentSkill;
      setCustomSkills((prev) => [...prev, createdSkill]);
      setCustomSkillTestStatusById((prev) => {
        const draftStatus = prev.__draft__;
        if (!draftStatus) return prev;

        const next = { ...prev, [createdSkill.id]: draftStatus };
        delete next.__draft__;
        return next;
      });
    }
    setNewCustomName('');
    setNewCustomKey('');
    setNewCustomDescription('');
    setNewCustomWebhookUrl('');
    setNewCustomInputSchema('');
    setCreatingCustomSkill(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  async function runCustomSkillWebhookTest(input: {
    webhookUrl: string;
    key?: string;
    name?: string;
    payload: Record<string, unknown>;
    skillStatusKey?: string;
  }) {
    if (!activeAgentId) return;

    const res = await fetchBackend(`/api/agents/${activeAgentId}/custom-skills/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookUrl: input.webhookUrl,
        key: input.key,
        name: input.name,
        input: input.payload,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      data?: { status?: number; responsePreview?: string };
    };

    const statusKey = input.skillStatusKey;
    const testedAt = Date.now();

    if (!res.ok || !json.ok) {
      setError(json.error ?? 'Webhook test failed');
      const preview = json.data?.responsePreview;
      if (preview) {
        setCustomSkillTestResult(preview);
      }
      if (statusKey) {
        setCustomSkillTestStatusById((prev) => ({
          ...prev,
          [statusKey]: {
            state: 'fail',
            testedAt,
            ...(json.data?.status !== undefined ? { statusCode: json.data.status } : {}),
          },
        }));
      }
      return;
    }

    const preview = json.data?.responsePreview ?? 'Webhook returned an empty response body.';
    setCustomSkillTestResult(preview);
    if (statusKey) {
      setCustomSkillTestStatusById((prev) => ({
        ...prev,
        [statusKey]: {
          state: 'pass',
          testedAt,
          ...(json.data?.status !== undefined ? { statusCode: json.data.status } : {}),
        },
      }));
    }
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  async function testCustomSkillWebhook() {
    if (!activeAgentId) return;
    setError('');
    setCustomSkillTestResult('');

    if (!newCustomWebhookUrl.trim()) {
      setError('Custom skill webhook URL is required for testing');
      return;
    }

    let parsedInput: Record<string, unknown> = { example: 'test' };
    if (newCustomInputSchema.trim()) {
      try {
        const parsed = JSON.parse(newCustomInputSchema) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setError('Custom input schema must be a JSON object');
          return;
        }
        parsedInput = parsed as Record<string, unknown>;
      } catch {
        setError('Custom input schema is not valid JSON');
        return;
      }
    }

    setTestingCustomSkill(true);
    const key = newCustomKey.trim();
    const name = newCustomName.trim();
    await runCustomSkillWebhookTest({
      webhookUrl: newCustomWebhookUrl.trim(),
      ...(key ? { key } : {}),
      ...(name ? { name } : {}),
      payload: parsedInput,
      skillStatusKey: '__draft__',
    });
    setTestingCustomSkill(false);
  }

  async function testSavedCustomSkillWebhook(skill: CustomAgentSkill) {
    if (!activeAgentId) return;
    setError('');
    setTestingCustomSkillId(skill.id);

    let parsedInput: Record<string, unknown> = { example: 'test' };
    if (skill.inputSchemaJson) {
      try {
        const parsed = JSON.parse(skill.inputSchemaJson) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsedInput = parsed as Record<string, unknown>;
        }
      } catch {
        parsedInput = { example: 'test' };
      }
    }

    await runCustomSkillWebhookTest({
      webhookUrl: skill.webhookUrl,
      key: skill.skillKey,
      name: skill.name,
      payload: parsedInput,
      skillStatusKey: skill.id,
    });

    setTestingCustomSkillId(null);
  }

  async function toggleCustomSkillEnabled(skill: CustomAgentSkill) {
    if (!activeAgentId) return;
    setError('');

    const res = await fetchBackend(`/api/agents/${activeAgentId}/custom-skills/${skill.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !skill.enabled }),
    });

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? 'Failed to update custom skill');
      return;
    }

    const json = (await res.json()) as { data?: CustomAgentSkill };
    if (json.data) {
      setCustomSkills((prev) => prev.map((item) => (item.id === skill.id ? json.data as CustomAgentSkill : item)));
    }
  }

  async function deleteCustomSkillById(skill: CustomAgentSkill) {
    if (!activeAgentId) return;
    setError('');

    const res = await fetchBackend(`/api/agents/${activeAgentId}/custom-skills/${skill.id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? 'Failed to delete custom skill');
      return;
    }

    setCustomSkills((prev) => prev.filter((item) => item.id !== skill.id));
  }

  const normalizedSkillSearch = skillSearch.trim().toLowerCase();
  const filteredSkills = SKILLS.filter((skill) => {
    if (!normalizedSkillSearch) return true;
    return (
      skill.title.toLowerCase().includes(normalizedSkillSearch) ||
      skill.description.toLowerCase().includes(normalizedSkillSearch) ||
      skill.key.toLowerCase().includes(normalizedSkillSearch)
    );
  });

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

    if (!res.ok) {
      setSaving(false);
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? 'Save failed');
      return;
    }

    if (enabledSkills.includes('support_escalation') && supportProvider !== 'none') {
      const isFreshdesk = supportProvider === 'freshdesk';
      const isJira = supportProvider === 'jira';
      const integrationRes = await fetchBackend(
        `/api/business/me/integrations/${supportProvider}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isFreshdesk
              ? {
                  ...(freshdeskApiKey.trim().length > 0 ? { accessToken: freshdeskApiKey.trim() } : {}),
                  config: { domain: freshdeskDomain.trim() },
                }
              : isJira
                ? {
                    ...(jiraApiToken.trim().length > 0 ? { accessToken: jiraApiToken.trim() } : {}),
                    config: {
                      siteUrl: jiraSiteUrl.trim(),
                      projectKey: jiraProjectKey.trim(),
                      issueType: jiraIssueType.trim() || 'Task',
                      supportEmail: jiraSupportEmail.trim(),
                    },
                  }
              : {
                  ...(zendeskApiToken.trim().length > 0 ? { accessToken: zendeskApiToken.trim() } : {}),
                  config: {
                    subdomain: zendeskSubdomain.trim(),
                    supportEmail: zendeskSupportEmail.trim(),
                  },
                }
          ),
        }
      );

      if (!integrationRes.ok) {
        setSaving(false);
        const json = (await integrationRes.json().catch(() => ({}))) as { error?: string };
        const label = isFreshdesk ? 'Freshdesk' : isJira ? 'Jira' : 'Zendesk';
        setError(json.error ?? `Failed to save ${label} integration`);
        return;
      }

      if (isFreshdesk) {
        setHasFreshdeskToken(hasFreshdeskToken || freshdeskApiKey.trim().length > 0);
        setFreshdeskApiKey('');
      } else if (isJira) {
        setHasJiraToken(hasJiraToken || jiraApiToken.trim().length > 0);
        setJiraApiToken('');
      } else {
        setHasZendeskToken(hasZendeskToken || zendeskApiToken.trim().length > 0);
        setZendeskApiToken('');
      }
    }

    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  if (loading) {
    return <div className="p-8 text-sm text-gray-400 dark:text-slate-500">Loading...</div>;
  }

  if (!hasActiveAgent) {
    return (
      <div className="p-8 max-w-3xl">
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">No active agent selected</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">
            Create an agent first, then select it to manage skills and integrations.
          </p>
          <Link href="/dashboard/agents" className="mt-4 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Go to Agents
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">Skills</h1>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
        Configure which tools your assistant can use. This page is designed to scale as more skills are added.
      </p>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-8">
        Need to connect Google, Zoom, or Calendly? Use the dedicated{' '}
        <Link href="/dashboard/integrations" className="text-brand-400 hover:text-brand-300 underline">
          Integrations page
        </Link>
        .
      </p>

      <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
        {error && <Alert type="error" message={error} />}
        {success && <Alert type="success" message="Skills saved." />}

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-0.5">Agent skills</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
            Enable the tools that make sense for your use-case. Changes take effect immediately.
          </p>

          <div className="mb-4">
            <input
              type="text"
              value={skillSearch}
              onChange={(e) => setSkillSearch(e.target.value)}
              placeholder="Search skills..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="space-y-3">
            {filteredSkills.map((skill) => {
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

            {filteredSkills.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/60 px-4 py-3 text-xs text-slate-400">
                No skills match your search.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-0.5">Custom webhook skills</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Add your own skill as a webhook endpoint. The agent sends structured JSON and uses the returned output in responses.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="text"
              value={newCustomName}
              onChange={(e) => setNewCustomName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              placeholder="Skill name (e.g. Estimate Shipping)"
            />
            <input
              type="text"
              value={newCustomKey}
              onChange={(e) => setNewCustomKey(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              placeholder="Optional key (e.g. estimate_shipping)"
            />
          </div>

          <input
            type="url"
            value={newCustomWebhookUrl}
            onChange={(e) => setNewCustomWebhookUrl(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Webhook URL (https://api.example.com/gcfis/custom-skill)"
          />

          <textarea
            value={newCustomDescription}
            onChange={(e) => setNewCustomDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="What this skill does and when the AI should call it"
          />

          <textarea
            value={newCustomInputSchema}
            onChange={(e) => setNewCustomInputSchema(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder={'Optional input schema JSON\n{"customerId":"string","priority":"string"}'}
          />

          <div className="flex justify-end">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={testCustomSkillWebhook}
                disabled={testingCustomSkill || !activeAgentId}
                className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {testingCustomSkill ? 'Testing...' : 'Test webhook'}
              </button>
              <button
                type="button"
                onClick={createCustomSkill}
                disabled={creatingCustomSkill || !activeAgentId}
                className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50"
              >
                {creatingCustomSkill ? 'Adding...' : 'Add custom skill'}
              </button>
            </div>
          </div>

          {customSkillTestResult && (
            <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
              <p className="text-xs text-slate-400 mb-1">Webhook test response</p>
              <pre className="text-xs text-slate-200 whitespace-pre-wrap break-words">{customSkillTestResult}</pre>
            </div>
          )}

          <div className="space-y-2">
            {customSkills.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/60 px-4 py-3 text-xs text-slate-400">
                No custom skills yet.
              </div>
            )}

            {customSkills.map((skill) => {
              const testStatus = customSkillTestStatusById[skill.id];

              return (
              <div key={skill.id} className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-100">{skill.name}</p>
                      {testStatus && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            testStatus.state === 'pass'
                              ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-500/30'
                              : 'bg-red-900/40 text-red-300 border border-red-500/30'
                          }`}
                        >
                          {testStatus.state === 'pass' ? 'Test passed' : 'Test failed'}
                          {testStatus.statusCode !== undefined
                            ? ` (${testStatus.statusCode})`
                            : ''}
                          {` ${new Date(testStatus.testedAt).toLocaleTimeString()}`}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">{skill.skillKey}</p>
                    {skill.description && <p className="text-xs text-slate-300 mt-1">{skill.description}</p>}
                    <p className="text-xs text-slate-400 mt-1 font-mono break-all">{skill.webhookUrl}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => testSavedCustomSkillWebhook(skill)}
                      disabled={testingCustomSkillId === skill.id || !activeAgentId}
                      className="px-3 py-1.5 rounded text-xs font-semibold border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                    >
                      {testingCustomSkillId === skill.id ? 'Testing...' : 'Test'}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleCustomSkillEnabled(skill)}
                      className={`px-3 py-1.5 rounded text-xs font-semibold ${skill.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-200'}`}
                    >
                      {skill.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCustomSkillById(skill)}
                      className="px-3 py-1.5 rounded text-xs font-semibold border border-red-500/40 text-red-300 hover:bg-red-900/30"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );})}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-0.5">Meeting integration</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Connect one provider so the agent can create meetings when a customer confirms a slot.
              </p>
            </div>

            {!enabledSkills.includes('meeting_scheduler') && (
              <div className="rounded-lg border border-amber-300/40 bg-amber-50/10 px-3 py-2 text-xs text-amber-200">
                Enable the <strong>Meeting Scheduler</strong> skill above to allow automatic meeting booking.
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Provider</label>
              <select
                value={meetingProvider}
                onChange={(e) => setMeetingProvider(e.target.value as 'none' | 'google' | 'zoom' | 'calendly')}
                disabled={!enabledSkills.includes('meeting_scheduler')}
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
                disabled={!enabledSkills.includes('meeting_scheduler')}
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
                    disabled={!enabledSkills.includes('meeting_scheduler')}
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
                      disabled={connectingProvider === 'google' || !enabledSkills.includes('meeting_scheduler')}
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
                      disabled={connectingProvider === 'zoom' || !enabledSkills.includes('meeting_scheduler')}
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
                  disabled={!enabledSkills.includes('meeting_scheduler')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="https://calendly.com/your-team/intro-call"
                />
              </div>
            )}
          </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-0.5">Support integration</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Connect Zendesk, Freshdesk, or Jira so the agent can escalate unresolved requests as support tickets.
            </p>
          </div>

          {!enabledSkills.includes('support_escalation') && (
            <div className="rounded-lg border border-amber-300/40 bg-amber-50/10 px-3 py-2 text-xs text-amber-200">
              Enable the <strong>Support Escalation</strong> skill above to activate ticket creation.
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Provider</label>
            <select
              value={supportProvider}
              onChange={(e) => setSupportProvider(e.target.value as 'none' | 'zendesk' | 'freshdesk' | 'jira')}
              disabled={!enabledSkills.includes('support_escalation')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="none">Not connected</option>
              <option value="zendesk">Zendesk</option>
              <option value="freshdesk">Freshdesk</option>
              <option value="jira">Jira</option>
            </select>
          </div>

          {supportProvider === 'zendesk' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Zendesk subdomain</label>
                <input
                  type="text"
                  value={zendeskSubdomain}
                  onChange={(e) => setZendeskSubdomain(e.target.value)}
                  disabled={!enabledSkills.includes('support_escalation')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="your-company"
                />
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Your Zendesk URL is <code className="dark:bg-slate-800 px-1 rounded">your-company.zendesk.com</code></p>
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Zendesk support email</label>
                <input
                  type="email"
                  value={zendeskSupportEmail}
                  onChange={(e) => setZendeskSupportEmail(e.target.value)}
                  disabled={!enabledSkills.includes('support_escalation')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="support@your-company.com"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Zendesk API token</label>
                <input
                  type="password"
                  value={zendeskApiToken}
                  onChange={(e) => setZendeskApiToken(e.target.value)}
                  disabled={!enabledSkills.includes('support_escalation')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder={hasZendeskToken ? 'Saved (enter to rotate)' : 'Paste API token'}
                />
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  {hasZendeskToken ? 'A token is already stored securely.' : 'No token configured yet.'}
                </p>
              </div>
            </>
          )}

          {supportProvider === 'freshdesk' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Freshdesk domain</label>
                <input
                  type="text"
                  value={freshdeskDomain}
                  onChange={(e) => setFreshdeskDomain(e.target.value)}
                  disabled={!enabledSkills.includes('support_escalation')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="your-company"
                />
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Your Freshdesk URL is <code className="dark:bg-slate-800 px-1 rounded">your-company.freshdesk.com</code></p>
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Freshdesk API key</label>
                <input
                  type="password"
                  value={freshdeskApiKey}
                  onChange={(e) => setFreshdeskApiKey(e.target.value)}
                  disabled={!enabledSkills.includes('support_escalation')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder={hasFreshdeskToken ? 'Saved (enter to rotate)' : 'Paste API key'}
                />
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  {hasFreshdeskToken ? 'A key is already stored securely.' : 'No key configured yet. Find it under Profile Settings in Freshdesk.'}
                </p>
              </div>
            </>
          )}

          {supportProvider === 'jira' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Jira site URL</label>
                <input
                  type="url"
                  value={jiraSiteUrl}
                  onChange={(e) => setJiraSiteUrl(e.target.value)}
                  disabled={!enabledSkills.includes('support_escalation')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="https://your-team.atlassian.net"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Jira project key</label>
                <input
                  type="text"
                  value={jiraProjectKey}
                  onChange={(e) => setJiraProjectKey(e.target.value)}
                  disabled={!enabledSkills.includes('support_escalation')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="SUP"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Jira issue type</label>
                <input
                  type="text"
                  value={jiraIssueType}
                  onChange={(e) => setJiraIssueType(e.target.value)}
                  disabled={!enabledSkills.includes('support_escalation')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="Task"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Jira email</label>
                <input
                  type="email"
                  value={jiraSupportEmail}
                  onChange={(e) => setJiraSupportEmail(e.target.value)}
                  disabled={!enabledSkills.includes('support_escalation')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="support@company.com"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Jira API token</label>
                <input
                  type="password"
                  value={jiraApiToken}
                  onChange={(e) => setJiraApiToken(e.target.value)}
                  disabled={!enabledSkills.includes('support_escalation')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder={hasJiraToken ? 'Saved (enter to rotate)' : 'Paste Jira API token'}
                />
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  {hasJiraToken ? 'A token is already stored securely.' : 'No token configured yet.'}
                </p>
              </div>
            </>
          )}
        </div>

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