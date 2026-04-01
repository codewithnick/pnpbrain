/**
 * Shared request validation and authentication helpers for API routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Validates the X-Api-Key header against BACKEND_API_SECRET.
 * Returns null if valid, or a 401 NextResponse if not.
 *
 * Note: only used for internal admin/widget calls — not end-user chat.
 */
export function requireApiKey(req: NextRequest): NextResponse | null {
  const secret = process.env['BACKEND_API_SECRET'];
  if (!secret) {
    console.error('BACKEND_API_SECRET is not configured');
    return NextResponse.json({ ok: false, error: 'Server misconfiguration' }, { status: 500 });
  }

  const provided = req.headers.get('x-api-key');
  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  return null; // Valid
}

/**
 * Returns a standard CORS preflight response.
 * Add `export async function OPTIONS() { return corsResponse(); }` to each route.
 */
export function corsResponse(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': process.env['ALLOWED_ORIGINS'] ?? '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
    },
  });
}

/**
 * Wraps a validation function and returns a 400 response on failure.
 */
export function badRequest(message: string): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

/**
 * Verifies the Supabase JWT from the Authorization header.
 *
 * Returns the authenticated userId (string) on success, or a NextResponse
 * error on failure. Callers should return the NextResponse immediately.
 *
 * Usage:
 *   const result = await requireSupabaseAuth(req);
 *   if (result instanceof NextResponse) return result;
 *   const { userId } = result;
 */
export async function requireSupabaseAuth(
  req: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseServiceKey =
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { ok: false, error: 'Server misconfiguration: Supabase env vars missing' },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid Authorization header' }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  return { userId: user.id };
}
