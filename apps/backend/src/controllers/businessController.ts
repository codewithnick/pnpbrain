import { Request, Response } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Business } from '@gcfis/db';
import { getDb } from '@gcfis/db/client';
import { agents, businesses } from '@gcfis/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { requireBusinessAuth } from '../middleware/auth';
import { generateAgentApiKey, resolveAgentForBusiness } from '../lib/agents';
import {
  generatePublicChatToken,
  getBusinessById,
  normalizeAllowedDomains,
  parseAllowedDomains,
  updateBusiness,
} from '../lib/business';
import {
  disconnectIntegrationForAgent,
  getAllIntegrationsForAgentScope,
  getEnabledSkillsForAgentScope,
  getMeetingIntegrationForAgentScope,
  getSupportIntegrationForAgentScope,
  setEnabledSkillsForAgent,
  upsertIntegrationForAgent,
} from '../lib/businessSkills';

const LLM_PROVIDERS = ['ollama', 'openai', 'anthropic', 'gemini', 'deepseek', 'huggingface'] as const;
const SKILL_NAMES = [
  'calculator',
  'datetime',
  'firecrawl',
  'lead_qualification',
  'meeting_scheduler',
  'support_escalation',
] as const;
const POSITIONS = ['bottom-right', 'bottom-left'] as const;
const THEMES = ['light', 'dark'] as const;
const OAUTH_PROVIDERS = ['google', 'zoom'] as const;
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

interface OAuthStatePayload {
  provider: OAuthProvider;
  businessId: string;
  agentId?: string;
  returnTo?: string;
  iat: number;
  nonce: string;
}

interface AgentOverrideView {
  id: string;
  allowedDomains: string;
  llmProvider: string;
  llmModel: string;
  llmBaseUrl: string | null;
  primaryColor: string;
  botName: string;
  welcomeMessage: string;
  widgetPosition: string;
  widgetTheme: string;
  showAvatar: boolean;
  agentApiKey: string | null;
}

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(500).optional(),
  llmProvider: z.enum(LLM_PROVIDERS).optional(),
  llmModel: z.string().min(1).max(80).optional(),
  llmApiKey: z.string().max(200).optional().nullable(),
  llmBaseUrl: z.string().url().optional().nullable(),
  enabledSkills: z.array(z.enum(SKILL_NAMES)).optional(),
  allowedDomains: z.array(z.string().min(1)).max(50).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).optional(),
  botName: z.string().min(1).max(60).optional(),
  welcomeMessage: z.string().max(200).optional(),
  widgetPosition: z.enum(POSITIONS).optional(),
  widgetTheme: z.enum(THEMES).optional(),
  showAvatar: z.boolean().optional(),
});

const connectSchema = z.object({
  returnTo: z.string().url().optional(),
});

async function toSafeBusinessResponse(
  business: Business,
  agentOverride?: AgentOverrideView | null,
) {
  const scope = agentOverride?.id
    ? { businessId: business.id, agentId: agentOverride.id }
    : { businessId: business.id, agentId: null };

  const [enabledSkills, integrations, meetingIntegration, supportIntegration] = await Promise.all([
    getEnabledSkillsForAgentScope(scope),
    getAllIntegrationsForAgentScope(scope),
    getMeetingIntegrationForAgentScope(scope),
    getSupportIntegrationForAgentScope(scope),
  ]);

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    description: business.description,
    ownerUserId: business.ownerUserId,
    allowedDomains: parseAllowedDomains(agentOverride?.allowedDomains ?? '[]'),
    enabledSkills,
    integrations,
    meetingIntegration,
    supportIntegration,
    llmProvider: agentOverride?.llmProvider ?? 'ollama',
    llmModel: agentOverride?.llmModel ?? 'llama3.1:8b',
    llmBaseUrl: agentOverride?.llmBaseUrl ?? null,
    primaryColor: agentOverride?.primaryColor ?? '#6366f1',
    botName: agentOverride?.botName ?? 'GCFIS Assistant',
    welcomeMessage: agentOverride?.welcomeMessage ?? 'Hi! How can I help you today?',
    widgetPosition: agentOverride?.widgetPosition ?? 'bottom-right',
    widgetTheme: agentOverride?.widgetTheme ?? 'light',
    showAvatar: agentOverride?.showAvatar ?? true,
    trialEndsAt: business.trialEndsAt,
    subscriptionStatus: business.subscriptionStatus,
    stripeCustomerId: business.stripeCustomerId,
    stripeSubscriptionId: business.stripeSubscriptionId,
    currentPeriodEnd: business.currentPeriodEnd,
    messagesUsedTotal: business.messagesUsedTotal,
    createdAt: business.createdAt,
    updatedAt: business.updatedAt,
    agentApiKey: agentOverride?.agentApiKey ?? null,
    selectedAgentId: agentOverride?.id ?? null,
    publicChatToken: generatePublicChatToken(business),
  };
}

async function resolveRequestedAgent(req: Request, businessId: string) {
  const headerAgentId = typeof req.headers['x-agent-id'] === 'string' ? req.headers['x-agent-id'] : undefined;
  const queryAgentId = typeof req.query['agentId'] === 'string' ? req.query['agentId'] : undefined;
  const requestedAgentId = (headerAgentId ?? queryAgentId)?.trim();

  if (!requestedAgentId) return null;
  return resolveAgentForBusiness(businessId, requestedAgentId);
}

export class BusinessController {
  public readonly getMe = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res);
    if (!auth) return;

    const business = await getBusinessById(auth.businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Business not found' });
    const selectedAgent = await resolveRequestedAgent(req, auth.businessId);
    return res.json({ ok: true, data: await toSafeBusinessResponse(business, selectedAgent) });
  };

  public readonly updateMe = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'admin');
    if (!auth) return;

    const business = await getBusinessById(auth.businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Business not found' });
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const updates = parsed.data as Record<string, unknown>;
    const selectedAgent = await resolveRequestedAgent(req, auth.businessId);

    if (parsed.data.slug && parsed.data.slug !== business.slug) {
      const db = getDb();
      const [slugConflict] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.slug, parsed.data.slug))
        .limit(1);

      if (slugConflict) {
        return res.status(409).json({ ok: false, error: 'That slug is already taken.' });
      }
    }

    const businessUpdates: Record<string, unknown> = {};
    const agentUpdates: Record<string, unknown> = {};

    if (parsed.data.name !== undefined) businessUpdates['name'] = parsed.data.name;
    if (parsed.data.slug !== undefined) businessUpdates['slug'] = parsed.data.slug;
    if (parsed.data.description !== undefined) businessUpdates['description'] = parsed.data.description;

    const requestedAgentScopedUpdates =
      parsed.data.allowedDomains !== undefined
      || parsed.data.llmProvider !== undefined
      || parsed.data.llmModel !== undefined
      || parsed.data.llmApiKey !== undefined
      || parsed.data.llmBaseUrl !== undefined
      || parsed.data.primaryColor !== undefined
      || parsed.data.botName !== undefined
      || parsed.data.welcomeMessage !== undefined
      || parsed.data.widgetPosition !== undefined
      || parsed.data.widgetTheme !== undefined
      || parsed.data.showAvatar !== undefined
      || parsed.data.enabledSkills !== undefined;

    if (requestedAgentScopedUpdates && !selectedAgent) {
      return res.status(400).json({
        ok: false,
        error: 'Select an agent to update skills, integrations, API key, and assistant configuration.',
      });
    }

    if (parsed.data.allowedDomains !== undefined) {
      agentUpdates['allowedDomains'] = JSON.stringify(normalizeAllowedDomains(parsed.data.allowedDomains));
    }
    if (parsed.data.llmProvider !== undefined) {
      agentUpdates['llmProvider'] = parsed.data.llmProvider;
    }
    if (parsed.data.llmModel !== undefined) {
      agentUpdates['llmModel'] = parsed.data.llmModel;
    }
    if (parsed.data.llmApiKey !== undefined) {
      agentUpdates['llmApiKey'] = parsed.data.llmApiKey;
    }
    if (parsed.data.llmBaseUrl !== undefined) {
      agentUpdates['llmBaseUrl'] = parsed.data.llmBaseUrl;
    }
    if (parsed.data.primaryColor !== undefined) {
      agentUpdates['primaryColor'] = parsed.data.primaryColor;
    }
    if (parsed.data.botName !== undefined) {
      agentUpdates['botName'] = parsed.data.botName;
    }
    if (parsed.data.welcomeMessage !== undefined) {
      agentUpdates['welcomeMessage'] = parsed.data.welcomeMessage;
    }
    if (parsed.data.widgetPosition !== undefined) {
      agentUpdates['widgetPosition'] = parsed.data.widgetPosition;
    }
    if (parsed.data.widgetTheme !== undefined) {
      agentUpdates['widgetTheme'] = parsed.data.widgetTheme;
    }
    if (parsed.data.showAvatar !== undefined) {
      agentUpdates['showAvatar'] = parsed.data.showAvatar;
    }

    const updatedBusiness = Object.keys(businessUpdates).length > 0
      ? await updateBusiness(business.id, businessUpdates)
      : business;

    if (!updatedBusiness) {
      return res.status(500).json({ ok: false, error: 'Failed to update business' });
    }

    if (selectedAgent && Object.keys(agentUpdates).length > 0) {
      await getDb()
        .update(agents)
        .set({ ...agentUpdates, updatedAt: sql`now()` })
        .where(and(eq(agents.id, selectedAgent.id), eq(agents.businessId, business.id)));
    }

    if (parsed.data.enabledSkills && selectedAgent) {
      await setEnabledSkillsForAgent(selectedAgent.id, parsed.data.enabledSkills);
    }

    const refreshedBusiness = await getBusinessById(business.id);
    if (!refreshedBusiness) {
      return res.status(500).json({ ok: false, error: 'Failed to refresh business after update' });
    }

    const refreshedAgent = selectedAgent ? await resolveAgentForBusiness(business.id, selectedAgent.id) : null;
    return res.json({ ok: true, data: await toSafeBusinessResponse(refreshedBusiness, refreshedAgent) });
  };

  public readonly rotateApiKey = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'owner');
    if (!auth) return;

    const business = await getBusinessById(auth.businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Business not found' });

    const selectedAgent = await resolveRequestedAgent(req, auth.businessId);
    if (!selectedAgent) {
      return res.status(400).json({
        ok: false,
        error: 'Select an agent before rotating API keys.',
      });
    }

    const [updatedAgent] = await getDb()
      .update(agents)
      .set({ agentApiKey: generateAgentApiKey(), updatedAt: sql`now()` })
      .where(and(eq(agents.id, selectedAgent.id), eq(agents.businessId, business.id)))
      .returning();

    if (!updatedAgent?.agentApiKey) {
      return res.status(500).json({ ok: false, error: 'Failed to rotate API key' });
    }

    return res.json({
      ok: true,
      data: {
        agentApiKey: updatedAgent.agentApiKey,
        businessId: business.id,
        agentId: updatedAgent.id,
      },
    });
  };

  public readonly updateIntegrationConfig = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'admin');
    if (!auth) return;

    const provider = req.params['provider'];
    if (!provider || typeof provider !== 'string' || provider.length > 40) {
      return res.status(400).json({ ok: false, error: 'Invalid provider' });
    }

    const schema = z.object({
      isDefault: z.boolean().optional(),
      accessToken: z.string().max(500).optional().nullable(),
      config: z
        .record(z.string().max(500))
        .optional(),
    });

    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const business = await getBusinessById(auth.businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Business not found' });

    const selectedAgent = await resolveRequestedAgent(req, auth.businessId);
    if (!selectedAgent) {
      return res.status(400).json({
        ok: false,
        error: 'Select an agent before updating integrations.',
      });
    }

    await upsertIntegrationForAgent(selectedAgent.id, provider, {
      ...(parsed.data.isDefault !== undefined ? { isDefault: parsed.data.isDefault } : {}),
      ...(parsed.data.accessToken !== undefined
        ? { accessToken: parsed.data.accessToken }
        : {}),
      ...(parsed.data.config !== undefined
        ? { configJson: JSON.stringify(parsed.data.config) }
        : {}),
    });

    return res.json({ ok: true });
  };

  public readonly getGoogleConnectUrl = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'admin');
    if (!auth) return;

    const parsed = connectSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const clientId = process.env['GOOGLE_OAUTH_CLIENT_ID'];
    if (!clientId) {
      return res.status(500).json({ ok: false, error: 'GOOGLE_OAUTH_CLIENT_ID is not configured' });
    }

    const returnTo = normalizeReturnTo(parsed.data.returnTo);
    const selectedAgent = await resolveRequestedAgent(req, auth.businessId);
    if (!selectedAgent) {
      return res.status(400).json({ ok: false, error: 'Select an agent before connecting integrations.' });
    }
    const state = signOAuthState({
      provider: 'google',
      businessId: auth.businessId,
      agentId: selectedAgent.id,
      ...(returnTo ? { returnTo } : {}),
      iat: Date.now(),
      nonce: randomBytes(16).toString('base64url'),
    });

    const redirectUri = `${getBackendPublicUrl()}/api/business/integrations/google/callback`;
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    return res.json({ ok: true, data: { authUrl: authUrl.toString() } });
  };

  public readonly getZoomConnectUrl = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'admin');
    if (!auth) return;

    const parsed = connectSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const clientId = process.env['ZOOM_OAUTH_CLIENT_ID'];
    if (!clientId) {
      return res.status(500).json({ ok: false, error: 'ZOOM_OAUTH_CLIENT_ID is not configured' });
    }

    const returnTo = normalizeReturnTo(parsed.data.returnTo);
    const selectedAgent = await resolveRequestedAgent(req, auth.businessId);
    if (!selectedAgent) {
      return res.status(400).json({ ok: false, error: 'Select an agent before connecting integrations.' });
    }
    const state = signOAuthState({
      provider: 'zoom',
      businessId: auth.businessId,
      agentId: selectedAgent.id,
      ...(returnTo ? { returnTo } : {}),
      iat: Date.now(),
      nonce: randomBytes(16).toString('base64url'),
    });

    const redirectUri = `${getBackendPublicUrl()}/api/business/integrations/zoom/callback`;
    const authUrl = new URL('https://zoom.us/oauth/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    return res.json({ ok: true, data: { authUrl: authUrl.toString() } });
  };

  public readonly googleCallback = async (req: Request, res: Response) => {
    const code = typeof req.query['code'] === 'string' ? req.query['code'] : '';
    const stateToken = typeof req.query['state'] === 'string' ? req.query['state'] : '';
    const error = typeof req.query['error'] === 'string' ? req.query['error'] : '';

    const state = verifyOAuthState(stateToken, 'google');
    if (!state) {
      return res.status(400).send('Invalid OAuth state');
    }

    if (error) {
      return res.redirect(withOAuthStatus(state.returnTo, 'google_error'));
    }

    if (!code) {
      return res.redirect(withOAuthStatus(state.returnTo, 'google_missing_code'));
    }

    const clientId = process.env['GOOGLE_OAUTH_CLIENT_ID'];
    const clientSecret = process.env['GOOGLE_OAUTH_CLIENT_SECRET'];
    if (!clientId || !clientSecret) {
      return res.status(500).send('Google OAuth env vars are not configured');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${getBackendPublicUrl()}/api/business/integrations/google/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      return res.redirect(withOAuthStatus(state.returnTo, 'google_token_error'));
    }

    const payload = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!payload.access_token) {
      return res.redirect(withOAuthStatus(state.returnTo, 'google_token_missing'));
    }

    const business = await getBusinessById(state.businessId);
    if (!business) {
      return res.redirect(withOAuthStatus(state.returnTo, 'google_business_missing'));
    }

    if (!state.agentId) {
      return res.redirect(withOAuthStatus(state.returnTo, 'google_agent_required'));
    }

    const selectedAgent = await resolveAgentForBusiness(business.id, state.agentId);
    if (!selectedAgent) {
      return res.redirect(withOAuthStatus(state.returnTo, 'google_agent_missing'));
    }

    await upsertIntegrationForAgent(selectedAgent.id, 'google', {
      accessToken: payload.access_token,
      ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
      ...(typeof payload.expires_in === 'number'
        ? { tokenExpiresAt: new Date(Date.now() + payload.expires_in * 1000) }
        : {}),
    });

    return res.redirect(withOAuthStatus(state.returnTo, 'google_connected'));
  };

  public readonly zoomCallback = async (req: Request, res: Response) => {
    const code = typeof req.query['code'] === 'string' ? req.query['code'] : '';
    const stateToken = typeof req.query['state'] === 'string' ? req.query['state'] : '';
    const error = typeof req.query['error'] === 'string' ? req.query['error'] : '';

    const state = verifyOAuthState(stateToken, 'zoom');
    if (!state) {
      return res.status(400).send('Invalid OAuth state');
    }

    if (error) {
      return res.redirect(withOAuthStatus(state.returnTo, 'zoom_error'));
    }

    if (!code) {
      return res.redirect(withOAuthStatus(state.returnTo, 'zoom_missing_code'));
    }

    const clientId = process.env['ZOOM_OAUTH_CLIENT_ID'];
    const clientSecret = process.env['ZOOM_OAUTH_CLIENT_SECRET'];
    if (!clientId || !clientSecret) {
      return res.status(500).send('Zoom OAuth env vars are not configured');
    }

    const tokenUrl = new URL('https://zoom.us/oauth/token');
    tokenUrl.searchParams.set('grant_type', 'authorization_code');
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('redirect_uri', `${getBackendPublicUrl()}/api/business/integrations/zoom/callback`);

    const tokenResponse = await fetch(tokenUrl.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
    });

    if (!tokenResponse.ok) {
      return res.redirect(withOAuthStatus(state.returnTo, 'zoom_token_error'));
    }

    const payload = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!payload.access_token) {
      return res.redirect(withOAuthStatus(state.returnTo, 'zoom_token_missing'));
    }

    const business = await getBusinessById(state.businessId);
    if (!business) {
      return res.redirect(withOAuthStatus(state.returnTo, 'zoom_business_missing'));
    }

    if (!state.agentId) {
      return res.redirect(withOAuthStatus(state.returnTo, 'zoom_agent_required'));
    }

    const selectedAgent = await resolveAgentForBusiness(business.id, state.agentId);
    if (!selectedAgent) {
      return res.redirect(withOAuthStatus(state.returnTo, 'zoom_agent_missing'));
    }

    await upsertIntegrationForAgent(selectedAgent.id, 'zoom', {
      accessToken: payload.access_token,
      ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
      ...(typeof payload.expires_in === 'number'
        ? { tokenExpiresAt: new Date(Date.now() + payload.expires_in * 1000) }
        : {}),
    });

    return res.redirect(withOAuthStatus(state.returnTo, 'zoom_connected'));
  };

  public readonly disconnectMeetingProvider = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'admin');
    if (!auth) return;

    const provider = req.params['provider'];
    if (!provider || provider.length > 40) {
      return res.status(400).json({ ok: false, error: 'Invalid provider' });
    }

    const business = await getBusinessById(auth.businessId);
    if (!business) {
      return res.status(404).json({ ok: false, error: 'Business not found' });
    }

    const selectedAgent = await resolveRequestedAgent(req, auth.businessId);
    if (!selectedAgent) {
      return res.status(400).json({ ok: false, error: 'Select an agent before disconnecting integrations.' });
    }

    await disconnectIntegrationForAgent(selectedAgent.id, provider);

    const refreshed = await getBusinessById(business.id);
    if (!refreshed) {
      return res.status(500).json({ ok: false, error: 'Failed to refresh business after disconnect' });
    }

    const refreshedAgent = selectedAgent ? await resolveAgentForBusiness(business.id, selectedAgent.id) : null;
    return res.json({ ok: true, data: await toSafeBusinessResponse(refreshed, refreshedAgent) });
  };
}

function getBackendPublicUrl(): string {
  return process.env['BACKEND_PUBLIC_URL'] ?? process.env['NEXT_PUBLIC_BACKEND_URL'] ?? 'http://localhost:3001';
}

function normalizeReturnTo(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function withOAuthStatus(returnTo: string | undefined, status: string): string {
  const fallback = process.env['NEXT_PUBLIC_ADMIN_URL'] ?? 'http://localhost:3000/dashboard/settings/skills';
  const target = normalizeReturnTo(returnTo) ?? fallback;
  const url = new URL(target);
  url.searchParams.set('oauth', status);
  return url.toString();
}

function getOAuthStateSecret(): string {
  const secret =
    process.env['OAUTH_STATE_SECRET']
    ?? process.env['PUBLIC_CHAT_TOKEN_SECRET']
    ?? process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!secret) {
    throw new Error('OAUTH_STATE_SECRET or fallback secret must be configured');
  }

  return secret;
}

function signOAuthState(payload: OAuthStatePayload): string {
  const secret = getOAuthStateSecret();
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifyOAuthState(token: string, expectedProvider: OAuthProvider): OAuthStatePayload | null {
  if (!token) return null;

  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) return null;

  const secret = getOAuthStateSecret();
  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as OAuthStatePayload;
    if (payload.provider !== expectedProvider) return null;
    if (!payload.businessId || !payload.iat || !payload.nonce) return null;
    if (Date.now() - payload.iat > OAUTH_STATE_MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
