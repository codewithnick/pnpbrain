/**
 * GET /api/public/[slug]
 *
 * Public, unauthenticated endpoint — returns the display-safe config for a
 * business identified by its URL slug. Used by apps/marketing public chat page
 * to bootstrap the widget without a business ID lookup on the frontend.
 *
 * Sensitive fields (llmApiKey, ownerUserId) are excluded.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBusinessBySlug } from '@/lib/business';
import { corsResponse } from '@/lib/auth';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsResponse();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ ok: false, error: 'Invalid slug' }, { status: 400 });
  }

  const business = await getBusinessBySlug(slug);
  if (!business) {
    return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 });
  }

  // Public-safe subset of business config
  return NextResponse.json({
    ok: true,
    data: {
      id:             business.id,
      name:           business.name,
      slug:           business.slug,
      botName:        business.botName,
      welcomeMessage: business.welcomeMessage,
      primaryColor:   business.primaryColor,
      widgetPosition: business.widgetPosition,
      widgetTheme:    business.widgetTheme,
      showAvatar:     business.showAvatar,
    },
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
