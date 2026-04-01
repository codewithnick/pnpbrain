/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Billing Portal session for the authenticated business owner
 * so they can manage their subscription, payment method, and invoices.
 *
 * Authorization: Bearer <supabase-access-token>
 *
 * Response: { ok: true; url: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSupabaseAuth, corsResponse } from '@/lib/auth';
import { getBusinessByOwner } from '@/lib/business';
import { createPortalSession } from '@/lib/billing';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsResponse();
}

export async function POST(req: NextRequest) {
  const auth = await requireSupabaseAuth(req);
  if (auth instanceof NextResponse) return auth;

  const business = await getBusinessByOwner(auth.userId);
  if (!business) {
    return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 });
  }

  if (!business.stripeCustomerId) {
    return NextResponse.json(
      { ok: false, error: 'No active subscription found. Please subscribe first.' },
      { status: 400 }
    );
  }

  const adminUrl = process.env['NEXT_PUBLIC_ADMIN_URL'] ?? 'http://localhost:3012';
  const returnUrl = `${adminUrl}/dashboard/settings/billing`;

  try {
    const url = await createPortalSession(business, returnUrl);
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[billing/portal]', message);
    return NextResponse.json({ ok: false, error: 'Failed to create portal session' }, { status: 500 });
  }
}
