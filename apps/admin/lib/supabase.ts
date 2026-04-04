'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { logAuthInfo, logAuthWarn, maskEmail } from '@/lib/auth-debug';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';

let supabaseClient: SupabaseClient | null = null;
const SELECTED_AGENT_STORAGE_KEY = 'pnpbrain.selected-agent-id';
const inFlightBackendRequests = new Map<string, Promise<Response>>();
let cachedSelectedAgentId: string | null | undefined;

const AGENT_SCOPED_API_PREFIXES = [
  '/api/business/me',
  '/api/dashboard',
  '/api/knowledge',
  '/api/conversations',
  '/api/memory',
  '/api/skills',
];

export function getSupabaseBrowserClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  supabaseClient = createSupabaseBrowserClient();

  return supabaseClient;
}

export function getBackendUrl(): string {
  return process.env['NEXT_PUBLIC_BACKEND_URL'] ?? 'http://localhost:3011';
}

function buildBackendRequestUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const backendUrl = getBackendUrl().trim();
  const baseUrl = backendUrl.length > 0 ? backendUrl : 'http://localhost:3011';

  if (globalThis.window !== undefined) {
    const url = new URL(normalizedPath, baseUrl);
    return `/api/proxy${url.pathname}${url.search}`;
  }

  return new URL(normalizedPath, baseUrl).toString();
}

function slugifyBusinessName(value: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32)
    .replace(/^-+|-+$/g, '');

  return normalized || 'business';
}

export async function ensureBusinessProvisioned(): Promise<void> {
  const me = await fetchBackend('/api/business/me');
  logAuthInfo('ensure_business_lookup_complete', {
    ok: me.ok,
    status: me.status,
  });

  if (me.ok || me.status !== 404) {
    return;
  }

  const token = await getAccessToken();
  if (!token) {
    logAuthWarn('ensure_business_missing_access_token');
    return;
  }

  const {
    data: { user },
  } = await getSupabaseBrowserClient().auth.getUser();

  if (!user) {
    logAuthWarn('ensure_business_missing_user');
    return;
  }

  const safeEmail = maskEmail(user.email ?? null);
  const guessedName =
    typeof user.user_metadata?.['full_name'] === 'string' && user.user_metadata['full_name'].trim().length >= 2
      ? user.user_metadata['full_name'].trim()
      : user.email?.split('@')[0]?.trim() || 'My Business';

  const safeName = guessedName.length >= 2 ? guessedName : 'My Business';
  const slugBase = slugifyBusinessName(safeName);
  const suffix = user.id.replace(/-/g, '').slice(0, 6).toLowerCase();

  const register = async (slug: string) => {
    logAuthInfo('ensure_business_register_attempt', {
      email: safeEmail,
      slug,
    });

    return fetchBackend('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: safeName, slug }),
    });
  };

  let response = await register(`${slugBase}-${suffix}`.slice(0, 40));
  if (response.status === 409) {
    const fallbackSlug = `${slugBase}-${Date.now().toString().slice(-6)}`.slice(0, 40);
    logAuthWarn('ensure_business_slug_conflict', {
      email: safeEmail,
      fallbackSlug,
    });
    response = await register(fallbackSlug);
  }

  if (!response.ok && response.status !== 200 && response.status !== 201) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    logAuthWarn('ensure_business_register_failed', {
      email: safeEmail,
      status: response.status,
      error: payload.error ?? null,
    });
    throw new Error(payload.error ?? 'Failed to provision business');
  }

  logAuthInfo('ensure_business_register_succeeded', {
    email: safeEmail,
    status: response.status,
  });
}

export async function getAccessToken(): Promise<string> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  if (data.session?.access_token) {
    return data.session.access_token;
  }

  if (typeof document !== 'undefined') {
    const cookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('sb-access-token='));
    if (cookie) {
      return decodeURIComponent(cookie.split('=').slice(1).join('='));
    }
  }

  return '';
}

export function persistAccessTokenCookie(accessToken?: string | null): void {
  if (typeof document === 'undefined') return;

  if (!accessToken) {
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0; SameSite=Lax';
    return;
  }

  document.cookie = `sb-access-token=${encodeURIComponent(accessToken)}; Path=/; Max-Age=604800; SameSite=Lax`;
}

export function getSelectedAgentId(): string | null {
  if (globalThis.window === undefined) return null;
  if (cachedSelectedAgentId !== undefined) return cachedSelectedAgentId;

  const value = globalThis.window.localStorage.getItem(SELECTED_AGENT_STORAGE_KEY)?.trim();
  cachedSelectedAgentId = value || null;
  return cachedSelectedAgentId;
}

export function setSelectedAgentId(agentId: string | null): void {
  if (globalThis.window === undefined) return;

  if (agentId && agentId.trim().length > 0) {
    const normalizedAgentId = agentId.trim();
    cachedSelectedAgentId = normalizedAgentId;
    globalThis.window.localStorage.setItem(SELECTED_AGENT_STORAGE_KEY, normalizedAgentId);
  } else {
    cachedSelectedAgentId = null;
    globalThis.window.localStorage.removeItem(SELECTED_AGENT_STORAGE_KEY);
  }
}

function shouldApplyAgentScope(path: string): boolean {
  return AGENT_SCOPED_API_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function withAgentScope(path: string, agentId: string | null): string {
  if (!agentId || !shouldApplyAgentScope(path)) {
    return path;
  }

  const url = new URL(path, 'http://localhost');
  if (!url.searchParams.has('agentId')) {
    url.searchParams.set('agentId', agentId);
  }

  return `${url.pathname}${url.search}`;
}

function buildRequestDedupKey(url: string, method: string, selectedAgentId: string | null): string | null {
  if (method !== 'GET' && method !== 'HEAD') {
    return null;
  }

  return `${method}:${url}:${selectedAgentId ?? 'all-agents'}`;
}

export async function fetchBackend(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const selectedAgentId = getSelectedAgentId();
  const scopedPath = withAgentScope(path, selectedAgentId);

  if (selectedAgentId && shouldApplyAgentScope(path)) {
    headers.set('x-agent-id', selectedAgentId);
  }

  const method = (init.method ?? 'GET').toUpperCase();
  const requestUrl = buildBackendRequestUrl(scopedPath);
  const dedupKey = buildRequestDedupKey(requestUrl, method, selectedAgentId);

  try {
    if (dedupKey) {
      const inFlightRequest = inFlightBackendRequests.get(dedupKey);
      if (inFlightRequest) {
        return (await inFlightRequest).clone();
      }
    }

    const requestPromise = fetch(requestUrl, {
      ...init,
      headers,
    });

    if (dedupKey) {
      inFlightBackendRequests.set(dedupKey, requestPromise);
    }

    const response = await requestPromise;

    if (dedupKey) {
      inFlightBackendRequests.delete(dedupKey);
      return response.clone();
    }

    return response;
  } catch (error) {
    if (dedupKey) {
      inFlightBackendRequests.delete(dedupKey);
    }

    const message =
      error instanceof Error
        ? error.message
        : 'Failed to reach backend API. Ensure BACKEND_INTERNAL_URL or NEXT_PUBLIC_BACKEND_URL points to a running backend.';

    return new Response(JSON.stringify({ error: message }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}