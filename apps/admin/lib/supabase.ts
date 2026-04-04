'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';

let supabaseClient: SupabaseClient | null = null;
const SELECTED_AGENT_STORAGE_KEY = 'pnpbrain.selected-agent-id';

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
  const backendUrl = getBackendUrl().trim();
  const baseUrl = backendUrl.length > 0 ? backendUrl : 'http://localhost:3011';

  // Build URL safely for both absolute and relative API paths.
  return new URL(path, baseUrl).toString();
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
  if (me.ok || me.status !== 404) {
    return;
  }

  const token = await getAccessToken();
  if (!token) {
    return;
  }

  const {
    data: { user },
  } = await getSupabaseBrowserClient().auth.getUser();

  if (!user) {
    return;
  }

  const guessedName =
    typeof user.user_metadata?.['full_name'] === 'string' && user.user_metadata['full_name'].trim().length >= 2
      ? user.user_metadata['full_name'].trim()
      : user.email?.split('@')[0]?.trim() || 'My Business';

  const safeName = guessedName.length >= 2 ? guessedName : 'My Business';
  const slugBase = slugifyBusinessName(safeName);
  const suffix = user.id.replace(/-/g, '').slice(0, 6).toLowerCase();

  const register = async (slug: string) => {
    return fetch(`${getBackendUrl()}/api/auth/register`, {
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
    response = await register(fallbackSlug);
  }

  if (!response.ok && response.status !== 200 && response.status !== 201) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? 'Failed to provision business');
  }
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
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(SELECTED_AGENT_STORAGE_KEY)?.trim();
  return value ? value : null;
}

export function setSelectedAgentId(agentId: string | null): void {
  if (typeof window === 'undefined') return;

  if (agentId && agentId.trim().length > 0) {
    window.localStorage.setItem(SELECTED_AGENT_STORAGE_KEY, agentId.trim());
  } else {
    window.localStorage.removeItem(SELECTED_AGENT_STORAGE_KEY);
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

  try {
    return await fetch(buildBackendRequestUrl(scopedPath), {
      ...init,
      headers,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to reach backend API. Ensure NEXT_PUBLIC_BACKEND_URL points to a running backend.';

    return new Response(JSON.stringify({ error: message }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}