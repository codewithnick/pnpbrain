/**
 * GET /api/billing/status
 *
 * Returns the billing status for the authenticated business owner.
 *
 * Authorization: Bearer <supabase-access-token>
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSupabaseAuth, corsResponse } from '@/lib/auth';
import { getBusinessByOwner } from '@/lib/business';
import { getBillingStatus } from '@/lib/billing';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsResponse();
}

export async function GET(req: NextRequest) {
  const auth = await requireSupabaseAuth(req);
  if (auth instanceof NextResponse) return auth;

  const business = await getBusinessByOwner(auth.userId);
  if (!business) {
    return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: getBillingStatus(business) });
}
