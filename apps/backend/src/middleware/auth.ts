import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@gcfis/db/client';
import { businesses, businessMembers, ROLE_RANK, type BusinessMemberRole } from '@gcfis/db/schema';

interface AuthResult {
  userId: string;
  email: string;
}

export interface BusinessAuthResult {
  userId: string;
  email: string;
  businessId: string;
  role: BusinessMemberRole;
}

export function requireApiKey(req: Request, res: Response): boolean {
  const secret = process.env['BACKEND_API_SECRET'];
  if (!secret) {
    res.status(500).json({ ok: false, error: 'Server misconfiguration' });
    return false;
  }

  const provided = req.header('x-api-key');
  if (provided !== secret) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return false;
  }

  return true;
}

export async function requireSupabaseAuth(
  req: Request,
  res: Response
): Promise<AuthResult | null> {
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseServiceKey =
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY'];

  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(500).json({ ok: false, error: 'Server misconfiguration: Supabase env vars missing' });
    return null;
  }

  const authHeader = req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: 'Missing or invalid Authorization header' });
    return null;
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return null;
  }

  return { userId: user.id, email: user.email ?? '' };
}

/**
 * Validates the Supabase JWT and resolves the caller's business membership.
 *
 * Resolution order:
 *   1. Look up `business_members` for this user (supports both owners and
 *      invited members).
 *   2. Fall back to `businesses.ownerUserId` for existing owners who don't
 *      have a `business_members` row yet, and auto-create the row.
 *
 * @param minRole  Optional minimum role required.  Returns 403 if the caller's
 *                 role is below the threshold.
 */
export async function requireBusinessAuth(
  req: Request,
  res: Response,
  minRole?: BusinessMemberRole,
): Promise<BusinessAuthResult | null> {
  const supabaseAuth = await requireSupabaseAuth(req, res);
  if (!supabaseAuth) return null;

  const { userId, email } = supabaseAuth;
  const db = getDb();

  // 1. Look up business_members
  const [membership] = await db
    .select()
    .from(businessMembers)
    .where(eq(businessMembers.userId, userId))
    .orderBy(businessMembers.createdAt)
    .limit(1);

  if (membership) {
    if (minRole && ROLE_RANK[membership.role as BusinessMemberRole] < ROLE_RANK[minRole]) {
      res.status(403).json({ ok: false, error: 'Insufficient permissions' });
      return null;
    }
    return {
      userId,
      email,
      businessId: membership.businessId,
      role: membership.role as BusinessMemberRole,
    };
  }

  // 2. Fallback: check ownerUserId on businesses (for pre-RBAC accounts)
  const [business] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.ownerUserId, userId))
    .limit(1);

  if (!business) {
    res.status(404).json({ ok: false, error: 'No business found. Complete onboarding first.' });
    return null;
  }

  // Auto-migrate: create the owner membership row so future lookups use path 1
  const [newMembership] = await db
    .insert(businessMembers)
    .values({ businessId: business.id, userId, email, role: 'owner' })
    .onConflictDoNothing()
    .returning();

  // onConflictDoNothing may return nothing if the row already existed
  const resolvedRole: BusinessMemberRole = (newMembership?.role ?? 'owner') as BusinessMemberRole;

  if (minRole && ROLE_RANK[resolvedRole] < ROLE_RANK[minRole]) {
    res.status(403).json({ ok: false, error: 'Insufficient permissions' });
    return null;
  }

  return { userId, email, businessId: business.id, role: resolvedRole };
}
