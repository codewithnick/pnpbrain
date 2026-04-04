import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { logAuthError, logAuthInfo, logAuthWarn, maskEmail } from '@/lib/auth-debug';
import { buildAdminUrl } from '@/lib/public-url';
import { createClient } from '@/utils/supabase/server';

function toSafeNextPath(value: string | null): string {
  if (!value) return '/dashboard';
  return value.startsWith('/') ? value : '/dashboard';
}

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

function normalizeBackendBaseUrl(value?: string | null): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized.replace(/\/+$/, '');
}

function getBackendBaseUrls(): string[] {
  const configuredValues = [
    process.env['BACKEND_INTERNAL_URL'],
    process.env['BACKEND_PUBLIC_URL'],
    process.env['NEXT_PUBLIC_BACKEND_URL'],
    process.env['NODE_ENV'] === 'production' ? 'https://api.pnpbrain.com' : null,
    'http://localhost:3011',
  ];

  const normalizedValues = configuredValues
    .map((value) => normalizeBackendBaseUrl(value))
    .filter((value): value is string => Boolean(value));

  return [...new Set(normalizedValues)];
}

function isMissingVercelDeploymentResponse(response: Response): boolean {
  if (response.status !== 404) {
    return false;
  }

  const vercelError = response.headers.get('x-vercel-error')?.toUpperCase();
  const server = response.headers.get('server')?.toLowerCase();
  const responseHost = (() => {
    try {
      return new URL(response.url).hostname.toLowerCase();
    } catch {
      return '';
    }
  })();

  return vercelError === 'DEPLOYMENT_NOT_FOUND'
    || responseHost.endsWith('.vercel.app')
    || server === 'vercel';
}

function shouldRetryProvisionResponse(response: Response): boolean {
  return isMissingVercelDeploymentResponse(response)
    || response.status === 408
    || response.status === 425
    || response.status === 429
    || response.status >= 500;
}

async function waitForRetry(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function fetchBackendWithFallback(path: string, init: RequestInit = {}): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const baseUrl of getBackendBaseUrls()) {
      try {
        const response = await fetch(new URL(path, `${baseUrl}/`).toString(), {
          ...init,
          cache: 'no-store',
        });

        if (!shouldRetryProvisionResponse(response)) {
          return response;
        }

        lastResponse = response;
      } catch (error) {
        lastError = error;
      }
    }

    if (attempt < 1) {
      await waitForRetry(250);
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to reach backend API');
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

async function ensureBusinessProvisionedServerSide(
  accessToken: string,
  email: string | null,
  userId: string,
  displayName?: string | null,
) {
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  const meResponse = await fetchBackendWithFallback('/api/business/me', {
    headers: authHeader,
  });

  if (meResponse.ok) {
    return;
  }

  if (meResponse.status !== 404) {
    throw new Error(await readProvisioningError(meResponse, 'Unable to verify business setup'));
  }

  const baseName = displayName?.trim() || email?.split('@')[0]?.trim() || 'My Business';
  const safeName = baseName.length >= 2 ? baseName : 'My Business';
  const slugBase = slugifyBusinessName(safeName);
  const suffix = userId.replaceAll('-', '').slice(0, 6).toLowerCase();

  const register = async (slug: string) => {
    return fetchBackendWithFallback('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({ name: safeName, slug }),
    });
  };

  let registerResponse = await register(`${slugBase}-${suffix}`.slice(0, 40));
  if (registerResponse.status === 409) {
    registerResponse = await register(`${slugBase}-${Date.now().toString().slice(-6)}`.slice(0, 40));
  }

  if (!registerResponse.ok && registerResponse.status !== 200 && registerResponse.status !== 201) {
    throw new Error(await readProvisioningError(registerResponse, 'Failed to provision business'));
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const nextPath = toSafeNextPath(requestUrl.searchParams.get('next'));
  const providerError = requestUrl.searchParams.get('error_description');

  logAuthInfo('auth_callback_received', {
    nextPath,
    hasCode: Boolean(code),
    hasProviderError: Boolean(providerError),
  });

  if (providerError) {
    logAuthWarn('auth_callback_provider_error', {
      nextPath,
      providerError,
    });
    const loginUrl = buildAdminUrl('/login', request);
    loginUrl.searchParams.set('error', providerError);
    return NextResponse.redirect(loginUrl);
  }

  // Some providers/flows may return without a code; fall back to target path.
  // Middleware will enforce auth and redirect to login if no session exists.
  if (!code) {
    logAuthWarn('auth_callback_missing_code', { nextPath });
    return NextResponse.redirect(buildAdminUrl(nextPath, request));
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logAuthError('auth_callback_exchange_failed', error, { nextPath });
    const loginUrl = buildAdminUrl('/login', request);
    loginUrl.searchParams.set('error', error.message);
    return NextResponse.redirect(loginUrl);
  }

  const [{ data: sessionData }, { data: userData }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);

  const accessToken = sessionData.session?.access_token;
  const user = userData.user;

  logAuthInfo('auth_callback_session_ready', {
    nextPath,
    hasAccessToken: Boolean(accessToken),
    userId: user?.id ?? null,
    email: maskEmail(user?.email ?? null),
  });

  if (accessToken && user) {
    try {
      logAuthInfo('auth_callback_provision_check_started', {
        userId: user.id,
        email: maskEmail(user.email ?? null),
      });
      await ensureBusinessProvisionedServerSide(
        accessToken,
        user.email ?? null,
        user.id,
        typeof user.user_metadata?.['full_name'] === 'string' ? user.user_metadata['full_name'] : null,
      );
      logAuthInfo('auth_callback_provision_check_succeeded', {
        userId: user.id,
      });
    } catch (provisionError) {
      logAuthError('auth_callback_provision_check_failed', provisionError, {
        userId: user.id,
        email: maskEmail(user.email ?? null),
      });
      const loginUrl = buildAdminUrl('/login', request);
      loginUrl.searchParams.set(
        'error',
        provisionError instanceof Error
          ? provisionError.message
          : 'Unable to finish account setup'
      );
      return NextResponse.redirect(loginUrl);
    }
  }

  logAuthInfo('auth_callback_redirecting', {
    nextPath,
    hasUser: Boolean(user),
  });
  return NextResponse.redirect(buildAdminUrl(nextPath, request));
}
