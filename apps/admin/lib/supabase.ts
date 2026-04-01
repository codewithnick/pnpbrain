'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  supabaseClient = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? ''
  );

  return supabaseClient;
}

export function getBackendUrl(): string {
  return process.env['NEXT_PUBLIC_BACKEND_URL'] ?? 'http://localhost:3001';
}

export async function getAccessToken(): Promise<string> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return data.session?.access_token ?? '';
}

export function persistAccessTokenCookie(accessToken?: string | null): void {
  if (typeof document === 'undefined') return;

  if (!accessToken) {
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0; SameSite=Lax';
    return;
  }

  document.cookie = `sb-access-token=${encodeURIComponent(accessToken)}; Path=/; Max-Age=604800; SameSite=Lax`;
}

export async function fetchBackend(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(`${getBackendUrl()}${path}`, {
    ...init,
    headers,
  });
}