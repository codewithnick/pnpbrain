/**
 * GET  /api/memory?conversationId=xxx   — list memory facts for a conversation
 * DELETE /api/memory/[id]               — delete a specific memory fact
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@gcfis/db/client';
import { memoryFacts } from '@gcfis/db/schema';
import { eq } from 'drizzle-orm';
import { corsResponse, requireApiKey, badRequest } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const authErr = requireApiKey(req);
  if (authErr) return authErr;

  const conversationId = req.nextUrl.searchParams.get('conversationId');
  if (!conversationId) return badRequest('conversationId query param is required');

  const db = getDb();
  const facts = await db
    .select()
    .from(memoryFacts)
    .where(eq(memoryFacts.conversationId, conversationId))
    .orderBy(memoryFacts.createdAt);

  return NextResponse.json({ ok: true, data: facts });
}

export async function OPTIONS() {
  return corsResponse();
}
