import { NextRequest, NextResponse } from 'next/server';
import { createClientWithResponse } from '@/utils/supabase/middleware';

export async function middleware(req: NextRequest) {
  const { supabase, supabaseResponse } = createClientWithResponse(req);

  const { pathname } = req.nextUrl;
  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding');

  if (!isProtected) {
    return supabaseResponse;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/onboarding'],
};
