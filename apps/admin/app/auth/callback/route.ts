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
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32)
    .replace(/^-+|-+$/g, '');

  return normalized || 'business';
}

async function ensureBusinessProvisionedServerSide(accessToken: string, email: string | null, userId: string) {
  const backendUrl =
    process.env['BACKEND_INTERNAL_URL']?.trim()
    || process.env['NEXT_PUBLIC_BACKEND_URL']?.trim()
    || 'http://localhost:3011';
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  const meResponse = await fetch(`${backendUrl}/api/business/me`, {
    headers: authHeader,
    cache: 'no-store',
  });

  if (meResponse.ok || meResponse.status !== 404) {
    return;
  }

  const baseName = email?.split('@')[0]?.trim() || 'My Business';
  const safeName = baseName.length >= 2 ? baseName : 'My Business';
  const slugBase = slugifyBusinessName(safeName);
  const suffix = userId.replace(/-/g, '').slice(0, 6).toLowerCase();

  const register = async (slug: string) => {
    return fetch(`${backendUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({ name: safeName, slug }),
      cache: 'no-store',
    });
  };

  let registerResponse = await register(`${slugBase}-${suffix}`.slice(0, 40));
  if (registerResponse.status === 409) {
    registerResponse = await register(`${slugBase}-${Date.now().toString().slice(-6)}`.slice(0, 40));
  }

  if (!registerResponse.ok && registerResponse.status !== 200 && registerResponse.status !== 201) {
    const payload = (await registerResponse.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Failed to provision business ${payload.error ? `: ${payload.error}` : 'unknown error'}`);
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
      await ensureBusinessProvisionedServerSide(accessToken, user.email ?? null, user.id);
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
