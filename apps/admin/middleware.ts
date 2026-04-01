/**
 * Admin auth middleware — protects all /dashboard/* routes.
 * Redirects unauthenticated users to /login.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function middleware(req: NextRequest) {
  // Protect dashboard and onboarding routes
  const { pathname } = req.nextUrl;
  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding');
  if (!isProtected) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

  if (!supabaseUrl || !supabaseAnonKey) {
    // Misconfiguration — let through in dev so the app still renders
    console.error('[middleware] Supabase env vars are not set');
    return NextResponse.next();
  }

  // Read the Supabase auth cookie
  const accessToken = req.cookies.get('sb-access-token')?.value;

  if (!accessToken) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Verify token by calling Supabase
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/onboarding'],
};
