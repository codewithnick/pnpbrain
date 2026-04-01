/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout Session and returns the hosted URL.
 * The browser is redirected to Stripe to complete payment setup.
 *
 * Authorization: Bearer <supabase-access-token>
 *
 * Response: { ok: true; url: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSupabaseAuth, corsResponse } from '@/lib/auth';
import { getBusinessByOwner } from '@/lib/business';
import { createCheckoutSession } from '@/lib/billing';
import { createClient } from '@supabase/supabase-js';

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

  // Fetch owner email from Supabase for Stripe customer creation
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']!;
  const serviceKey =
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: { user } } = await supabase.auth.admin.getUserById(auth.userId);
  const email = user?.email ?? '';

  // The return URL is the billing settings page in the admin app
  const adminUrl = process.env['NEXT_PUBLIC_ADMIN_URL'] ?? 'http://localhost:3002';
  const returnUrl = `${adminUrl}/dashboard/settings/billing`;

  try {
    const url = await createCheckoutSession(business, email, returnUrl);
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[billing/checkout]', message);
    return NextResponse.json({ ok: false, error: 'Failed to create checkout session' }, { status: 500 });
  }
}
