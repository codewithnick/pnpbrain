import { NextRequest, NextResponse } from 'next/server';
import { desc, eq, inArray } from 'drizzle-orm';
import { requireSupabaseAuth, corsResponse } from '@/lib/auth';
import { getBusinessByOwner } from '@/lib/business';
import { getDb } from '@pnpbrain/db/client';
import { conversations, messages } from '@pnpbrain/db/schema';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsResponse();
}

export async function GET(req: NextRequest) {
  const authResult = await requireSupabaseAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const business = await getBusinessByOwner(authResult.userId);
  if (!business) {
    return NextResponse.json(
      { ok: false, error: 'No business found. Complete onboarding first.' },
      { status: 404 }
    );
  }

  const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '25');
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 25;

  const db = getDb();
  const conversationRows = await db
    .select({
      id: conversations.id,
      sessionId: conversations.sessionId,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(eq(conversations.businessId, business.id))
    .orderBy(desc(conversations.updatedAt))
    .limit(limit);

  if (conversationRows.length === 0) {
    return NextResponse.json({ ok: true, data: [] });
  }

  const conversationIds = conversationRows.map((row) => row.id);
  const messageRows = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(inArray(messages.conversationId, conversationIds))
    .orderBy(desc(messages.createdAt));

  const grouped = new Map<string, typeof messageRows>();
  for (const row of messageRows) {
    const rows = grouped.get(row.conversationId) ?? [];
    rows.push(row);
    grouped.set(row.conversationId, rows);
  }

  const data = conversationRows.map((conversation) => {
    const rows = grouped.get(conversation.id) ?? [];
    const lastMessage = rows[0];
    const userMessages = rows.filter((row) => row.role === 'user').length;

    return {
      id: conversation.id,
      sessionId: conversation.sessionId,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messageCount: rows.length,
      userMessageCount: userMessages,
      preview: lastMessage?.content.slice(0, 160) ?? '',
      lastMessageAt: lastMessage?.createdAt.toISOString() ?? conversation.updatedAt.toISOString(),
      lastMessageRole: lastMessage?.role ?? null,
    };
  });

  return NextResponse.json({ ok: true, data });
}