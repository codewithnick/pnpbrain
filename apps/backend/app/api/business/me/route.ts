/**
 * GET  /api/business/me   — returns the authenticated owner's business config
 * PUT  /api/business/me   — updates the authenticated owner's business config
 *
 * Authorization: Bearer <supabase-access-token>
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSupabaseAuth, badRequest, corsResponse } from '@/lib/auth';
import { getBusinessByOwner, normalizeAllowedDomains, updateBusiness } from '@/lib/business';
import { getDb } from '@gcfis/db/client';
import { businesses } from '@gcfis/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

// Allowed LLM providers and skill names
const LLM_PROVIDERS = ['ollama', 'openai', 'anthropic'] as const;
const SKILL_NAMES = ['calculator', 'datetime', 'firecrawl'] as const;
const POSITIONS = ['bottom-right', 'bottom-left'] as const;
const THEMES = ['light', 'dark'] as const;

const UpdateSchema = z.object({
  // Profile
  name:           z.string().min(2).max(80).optional(),
  slug:           z.string().min(2).max(40).regex(/^[a-z0-9-]+$/).optional(),
  description:    z.string().max(500).optional(),
  // LLM
  llmProvider:    z.enum(LLM_PROVIDERS).optional(),
  llmModel:       z.string().min(1).max(80).optional(),
  llmApiKey:      z.string().max(200).optional().nullable(),
  llmBaseUrl:     z.string().url().optional().nullable(),
  // Skills
  enabledSkills:  z.array(z.enum(SKILL_NAMES)).optional(),
  allowedDomains: z.array(z.string().min(1)).max(50).optional(),
  // Theme
  primaryColor:   z.string().regex(/^#[0-9a-fA-F]{3,6}$/).optional(),
  botName:        z.string().min(1).max(60).optional(),
  welcomeMessage: z.string().max(200).optional(),
  widgetPosition: z.enum(POSITIONS).optional(),
  widgetTheme:    z.enum(THEMES).optional(),
  showAvatar:     z.boolean().optional(),
});

export async function OPTIONS() {
  return corsResponse();
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authResult = await requireSupabaseAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const business = await getBusinessByOwner(userId);
  if (!business) {
    return NextResponse.json(
      { ok: false, error: 'No business found. Complete onboarding first.' },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, data: sanitize(business) });
}

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const authResult = await requireSupabaseAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const business = await getBusinessByOwner(userId);
  if (!business) {
    return NextResponse.json(
      { ok: false, error: 'No business found. Complete onboarding first.' },
      { status: 404 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const updates = parsed.data;

  if (updates.slug && updates.slug !== business.slug) {
    const db = getDb();
    const [slugConflict] = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.slug, updates.slug))
      .limit(1);

    if (slugConflict) {
      return NextResponse.json(
        { ok: false, error: 'That slug is already taken. Choose another.' },
        { status: 409 }
      );
    }
  }

  // Serialise array fields to JSON strings for DB storage
  const dbPayload: Parameters<typeof updateBusiness>[1] = {};
  if (updates.name !== undefined) dbPayload.name = updates.name;
  if (updates.slug !== undefined) dbPayload.slug = updates.slug;
  if (updates.description !== undefined) dbPayload.description = updates.description;
  if (updates.llmProvider !== undefined) dbPayload.llmProvider = updates.llmProvider;
  if (updates.llmModel !== undefined) dbPayload.llmModel = updates.llmModel;
  if (updates.llmApiKey !== undefined) dbPayload.llmApiKey = updates.llmApiKey;
  if (updates.llmBaseUrl !== undefined) dbPayload.llmBaseUrl = updates.llmBaseUrl;
  if (updates.primaryColor !== undefined) dbPayload.primaryColor = updates.primaryColor;
  if (updates.botName !== undefined) dbPayload.botName = updates.botName;
  if (updates.welcomeMessage !== undefined) dbPayload.welcomeMessage = updates.welcomeMessage;
  if (updates.widgetPosition !== undefined) dbPayload.widgetPosition = updates.widgetPosition;
  if (updates.widgetTheme !== undefined) dbPayload.widgetTheme = updates.widgetTheme;
  if (updates.showAvatar !== undefined) dbPayload.showAvatar = updates.showAvatar;
  if (updates.enabledSkills !== undefined) {
    dbPayload.enabledSkills = JSON.stringify(updates.enabledSkills);
  }
  if (updates.allowedDomains !== undefined) {
    dbPayload.allowedDomains = JSON.stringify(normalizeAllowedDomains(updates.allowedDomains));
  }

  const updated = await updateBusiness(business.id, dbPayload);
  if (!updated) return badRequest('Update failed');

  return NextResponse.json({ ok: true, data: sanitize(updated) });
}

function sanitize(b: NonNullable<Awaited<ReturnType<typeof getBusinessByOwner>>>) {
  // Never return the LLM API key over the wire
  const { llmApiKey: _key, ...safe } = b;
  void _key;
  return {
    ...safe,
    // Parse stored JSON arrays back to real arrays for the client
    enabledSkills:  parseJsonArray(safe.enabledSkills),
    allowedDomains: parseJsonArray(safe.allowedDomains),
    // Indicate whether an API key is configured without exposing it
    hasLlmApiKey: _key !== null && _key !== undefined,
  };
}

function parseJsonArray(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    if (Array.isArray(v) && v.every((x): x is string => typeof x === 'string')) return v;
    return [];
  } catch {
    return [];
  }
}
