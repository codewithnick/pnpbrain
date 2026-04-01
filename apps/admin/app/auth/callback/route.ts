import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

function toSafeNextPath(value: string | null): string {
  if (!value) return '/dashboard';
  return value.startsWith('/') ? value : '/dashboard';
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const nextPath = toSafeNextPath(requestUrl.searchParams.get('next'));
  const providerError = requestUrl.searchParams.get('error_description');

  if (providerError) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', providerError);
    return NextResponse.redirect(loginUrl);
  }

  // Some providers/flows may return without a code; fall back to target path.
  // Middleware will enforce auth and redirect to login if no session exists.
  if (!code) {
    return NextResponse.redirect(new URL(nextPath, request.url));
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', error.message);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}
