import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export interface AuthResult {
  userId: string;
  email: string;
}

function isUsableSupabaseKey(value?: string): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;

  const placeholderPrefixes = ['your-', 'replace-', 'changeme', 'example'];
  return !placeholderPrefixes.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Validates a Supabase JWT token from the Authorization header.
 * Returns AuthResult on success, or NextResponse with 401/500 error.
 */
export async function requireSupabaseAuth(
  req: NextRequest
): Promise<AuthResult | NextResponse> {
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  const publishableKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY'];
  
  const hasValidServiceRole = isUsableSupabaseKey(serviceRoleKey);
  const supabaseAuthKey = hasValidServiceRole ? serviceRoleKey : publishableKey;

  if (!supabaseUrl || !supabaseAuthKey) {
    return NextResponse.json(
      { ok: false, error: 'Server misconfiguration: Supabase env vars missing' },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid Authorization header' },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseAuthKey);
  
  let user;
  let error;
  
  // Use admin API when service role key is available; otherwise use regular API
  if (hasValidServiceRole) {
    const result = await supabase.auth.admin.getUser(token);
    user = result.data.user;
    error = result.error;
  } else {
    const result = await supabase.auth.getUser(token);
    user = result.data.user;
    error = result.error;
  }

  if (error || !user) {
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn('[auth] Supabase token validation failed', {
        reason: error?.message ?? 'No user returned',
        status: (error as { status?: number } | null)?.status,
        tokenLength: token.length,
        hasServiceRole: hasValidServiceRole,
      });
    }
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return { userId: user.id, email: user.email ?? '' };
}

/**
 * Returns a CORS OK response for OPTIONS requests.
 */
export function corsResponse(): NextResponse {
  return new NextResponse(null, { status: 200 });
}
