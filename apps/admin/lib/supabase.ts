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

function shouldRetryProvisionResponse(response: Response): boolean {
  return response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
}

async function waitForRetry(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function fetchProvisionResponse(path: string, init: RequestInit = {}): Promise<Response> {
  let response = await fetchBackend(path, init);

  for (let attempt = 0; attempt < 1 && shouldRetryProvisionResponse(response); attempt += 1) {
    await waitForRetry(250);
    response = await fetchBackend(path, init);
  }

  return response;
}

async function readProvisioningError(response: Response, fallbackMessage: string): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    const errorMessage = payload.error ?? payload.message;

    if (typeof errorMessage === 'string' && errorMessage.trim().length > 0) {
      return errorMessage;
    }
  }

  const bodyText = (await response.text().catch(() => '')).trim();
  if (!bodyText) {
    return `${fallbackMessage} (HTTP ${response.status})`;
  }

  return `${fallbackMessage} (HTTP ${response.status}): ${bodyText.slice(0, 240)}`;
}

export async function ensureBusinessProvisioned(): Promise<void> {
  const me = await fetchProvisionResponse('/api/business/me');
  logAuthInfo('ensure_business_lookup_complete', {
    ok: me.ok,
    status: me.status,
  });

  if (me.ok) {
    return;
  }

  if (me.status !== 404) {
    throw new Error(await readProvisioningError(me, 'Unable to verify business setup'));
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

    return fetchProvisionResponse('/api/auth/register', {
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
    const errorMessage = await readProvisioningError(response, 'Failed to provision business');
    logAuthWarn('ensure_business_register_failed', {
      email: safeEmail,
      status: response.status,
      error: errorMessage,
    });
    throw new Error(errorMessage);
  }

  logAuthInfo('ensure_business_register_succeeded', {
    email: safeEmail,
    status: response.status,
  });
}

