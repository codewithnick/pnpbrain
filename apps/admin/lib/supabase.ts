'use client';

import { logAuthInfo, logAuthWarn, maskEmail } from '@/lib/auth-debug';
import {
  fetchBackend,
  getAccessToken,
  getSupabaseBrowserClient,
} from '@/lib/api-client';

export {
  fetchBackend,
  getAccessToken,
  getBackendUrl,
  getSelectedAgentId,
  getSupabaseBrowserClient,
  persistAccessTokenCookie,
  setSelectedAgentId,
} from '@/lib/api-client';

function slugifyBusinessName(value: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .slice(0, 32)
    .replaceAll(/^-+|-+$/g, '');

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
  const suffix = user.id.replaceAll('-', '').slice(0, 6).toLowerCase();

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
    throw new Error(payload.error ?? `Failed to provision business ${payload.error ? `: ${payload.error}` : 'unknown error'}`);
  }

  logAuthInfo('ensure_business_register_succeeded', {
    email: safeEmail,
    status: response.status,
  });
}

