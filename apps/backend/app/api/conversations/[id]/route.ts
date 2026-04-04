import { NextRequest, NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { requireSupabaseAuth, corsResponse } from '@/lib/auth';
import { getBusinessByOwner } from '@/lib/business';
import { getDb } from '@pnpbrain/db/client';
import { conversations, messages } from '@pnpbrain/db/schema';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsResponse();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSupabaseAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const business = await getBusinessByOwner(authResult.userId);
  if (!business) {
    return NextResponse.json(
      { ok: false, error: 'No business found. Complete onboarding first.' },
      { status: 404 }
    );
  }

  const { id } = await params;
  const db = getDb();

  const [conversation] = await db
    .select({
      id: conversations.id,
      businessId: conversations.businessId,
      sessionId: conversations.sessionId,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);

  if (!conversation || conversation.businessId !== business.id) {
    return NextResponse.json({ ok: false, error: 'Conversation not found' }, { status: 404 });
  }

  const messageRows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      metadata: messages.metadata,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  return NextResponse.json({
    ok: true,
    data: {
      id: conversation.id,
      sessionId: conversation.sessionId,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messages: messageRows.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        metadata: message.metadata,
        createdAt: message.createdAt.toISOString(),
      })),
    },
  });
}