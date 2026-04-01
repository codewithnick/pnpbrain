/**
 * DELETE /api/knowledge/[id]  — delete a knowledge document + its chunks
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@gcfis/db/client';
import { knowledgeDocuments } from '@gcfis/db/schema';
import { and, eq } from 'drizzle-orm';
import { corsResponse, requireApiKey, requireSupabaseAuth, badRequest } from '@/lib/auth';
import { getBusinessByOwner } from '@/lib/business';

export const runtime = 'nodejs';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return badRequest('Document ID is required');

  const db = getDb();

  if (req.headers.get('authorization')?.startsWith('Bearer ')) {
    const authResult = await requireSupabaseAuth(req);
    if (authResult instanceof NextResponse) return authResult;

    const business = await getBusinessByOwner(authResult.userId);
    if (!business) {
      return NextResponse.json(
        { ok: false, error: 'No business found. Complete onboarding first.' },
        { status: 404 }
      );
    }

    const deleted = await db
      .delete(knowledgeDocuments)
      .where(and(eq(knowledgeDocuments.id, id), eq(knowledgeDocuments.businessId, business.id)))
      .returning({ id: knowledgeDocuments.id });

    if (deleted.length === 0) {
      return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: { id } });
  }

  const authErr = requireApiKey(req);
  if (authErr) return authErr;

  const deleted = await db
    .delete(knowledgeDocuments)
    .where(eq(knowledgeDocuments.id, id))
    .returning({ id: knowledgeDocuments.id });

  if (deleted.length === 0) {
    return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: { id } });
}

export async function OPTIONS() {
  return corsResponse();
}
