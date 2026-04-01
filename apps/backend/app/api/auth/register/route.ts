/**
 * POST /api/auth/register
 *
 * Creates a business row for a freshly-signed-up Supabase user.
 * The client signs up via the Supabase client SDK first, then calls this
 * endpoint with their access token + business details to provision a business.
 *
 * Body: { name: string; slug: string }
 * Authorization: Bearer <supabase-access-token>
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSupabaseAuth, badRequest, corsResponse } from '@/lib/auth';
import { createBusiness, getBusinessByOwner } from '@/lib/business';
import { getDb } from '@gcfis/db/client';
import { businesses } from '@gcfis/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

const RegisterSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(
      /^[a-z0-9-]+$/,
      'Slug may only contain lowercase letters, numbers, and hyphens'
    ),
});

export async function OPTIONS() {
  return corsResponse();
}

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const authResult = await requireSupabaseAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // ── Body ───────────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const { name, slug } = parsed.data;

  // ── Idempotency — don't create a second business for the same user ─────────
  const existing = await getBusinessByOwner(userId);
  if (existing) {
    return NextResponse.json({ ok: true, data: sanitize(existing) }, { status: 200 });
  }

  // ── Slug uniqueness ────────────────────────────────────────────────────────
  const db = getDb();
  const [slugConflict] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.slug, slug))
    .limit(1);

  if (slugConflict) {
    return NextResponse.json(
      { ok: false, error: 'That slug is already taken. Choose another.' },
      { status: 409 }
    );
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  const business = await createBusiness({ name, slug, ownerUserId: userId });
  return NextResponse.json({ ok: true, data: sanitize(business) }, { status: 201 });
}

/** Strip sensitive fields before returning to the client */
function sanitize(b: Awaited<ReturnType<typeof createBusiness>>) {
  // llmApiKey is never sent back to the browser
  const { llmApiKey: _key, ...safe } = b;
  void _key;
  return safe;
}
