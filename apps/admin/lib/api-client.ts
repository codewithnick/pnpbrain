'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getDirectBackendBaseUrl } from '@/lib/backend-url';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';

let supabaseClient: SupabaseClient | null = null;
const SELECTED_AGENT_STORAGE_KEY = 'pnpbrain.selected-agent-id';
const inFlightBackendRequests = new Map<string, Promise<Response>>();

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
  return getDirectBackendBaseUrl();
}

function buildBackendRequestUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, `${getBackendUrl()}/`).toString();
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

let cachedSelectedAgentId: string | null | undefined;

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
      if (inFlightRequest !== undefined) {
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
        : 'Failed to reach backend API. Ensure NEXT_PUBLIC_BACKEND_URL points to a running backend.';

    return new Response(JSON.stringify({ error: message }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
