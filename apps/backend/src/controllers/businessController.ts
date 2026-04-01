import { Request, Response } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Business } from '@gcfis/db';
import { getDb } from '@gcfis/db/client';
import { businesses } from '@gcfis/db/schema';
import { eq } from 'drizzle-orm';
import { requireBusinessAuth } from '../middleware/auth';
import {
  ensureBusinessApiKey,
  generateBusinessApiKey,
  generatePublicChatToken,
  getBusinessById,
  normalizeAllowedDomains,
  parseAllowedDomains,
  updateBusiness,
} from '../lib/business';
import {
  disconnectIntegration,
  getAllIntegrationsForBusiness,
  getMeetingIntegrationForBusiness,
  getSupportIntegrationForBusiness,
  getEnabledSkillsForBusiness,
  setEnabledSkillsForBusiness,
  upsertIntegration,
} from '../lib/businessSkills';

const LLM_PROVIDERS = ['ollama', 'openai', 'anthropic'] as const;
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
  returnTo?: string;
  iat: number;
  nonce: string;
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

async function toSafeBusinessResponse(business: Business) {
  const [enabledSkills, integrations, meetingIntegration, supportIntegration] = await Promise.all([
    getEnabledSkillsForBusiness(business.id),
    getAllIntegrationsForBusiness(business.id),
    getMeetingIntegrationForBusiness(business.id),
    getSupportIntegrationForBusiness(business.id),
  ]);

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    description: business.description,
    ownerUserId: business.ownerUserId,
    allowedDomains: parseAllowedDomains(business.allowedDomains),
    enabledSkills,
    integrations,
    meetingIntegration,
    supportIntegration,
    llmProvider: business.llmProvider,
    llmModel: business.llmModel,
    llmBaseUrl: business.llmBaseUrl,
    primaryColor: business.primaryColor,
    botName: business.botName,
    welcomeMessage: business.welcomeMessage,
    widgetPosition: business.widgetPosition,
    widgetTheme: business.widgetTheme,
    showAvatar: business.showAvatar,
    trialEndsAt: business.trialEndsAt,
    subscriptionStatus: business.subscriptionStatus,
    stripeCustomerId: business.stripeCustomerId,
    stripeSubscriptionId: business.stripeSubscriptionId,
    currentPeriodEnd: business.currentPeriodEnd,
    messagesUsedTotal: business.messagesUsedTotal,
    createdAt: business.createdAt,
    updatedAt: business.updatedAt,
    agentApiKey: business.agentApiKey,
    publicChatToken: generatePublicChatToken(business),
  };
}

export class BusinessController {
  public readonly getMe = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res);
    if (!auth) return;

    const business = await getBusinessById(auth.businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Business not found' });
    const withApiKey = await ensureBusinessApiKey(business);
    return res.json({ ok: true, data: await toSafeBusinessResponse(withApiKey) });
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

    if (parsed.data.allowedDomains) {
      updates['allowedDomains'] = JSON.stringify(normalizeAllowedDomains(parsed.data.allowedDomains));
    }

    const updated = await updateBusiness(business.id, updates);
    if (!updated) {
      return res.status(500).json({ ok: false, error: 'Failed to update business' });
    }

    if (parsed.data.enabledSkills) {
      await setEnabledSkillsForBusiness(business.id, parsed.data.enabledSkills);
    }

    const withApiKey = await ensureBusinessApiKey(updated);
    return res.json({ ok: true, data: await toSafeBusinessResponse(withApiKey) });
  };

  public readonly rotateApiKey = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'owner');
    if (!auth) return;

    const business = await getBusinessById(auth.businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Business not found' });
    const updated = await updateBusiness(business.id, { agentApiKey: generateBusinessApiKey() });
    if (!updated?.agentApiKey) {
      return res.status(500).json({ ok: false, error: 'Failed to rotate API key' });
    }

    return res.json({
      ok: true,
      data: {
        agentApiKey: updated.agentApiKey,
        businessId: updated.id,
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

    await upsertIntegration(business.id, provider, {
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
    const state = signOAuthState({
      provider: 'google',
      businessId: auth.businessId,
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
    const state = signOAuthState({
      provider: 'zoom',
      businessId: auth.businessId,
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

    await upsertIntegration(business.id, 'google', {
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

    await upsertIntegration(business.id, 'zoom', {
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

    await disconnectIntegration(business.id, provider);

    const refreshed = await getBusinessById(business.id);
    if (!refreshed) {
      return res.status(500).json({ ok: false, error: 'Failed to refresh business after disconnect' });
    }

    return res.json({ ok: true, data: await toSafeBusinessResponse(refreshed) });
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
