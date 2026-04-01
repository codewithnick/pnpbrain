import { NextRequest, NextResponse } from 'next/server';
import { count, eq } from 'drizzle-orm';
import { requireSupabaseAuth, corsResponse } from '@/lib/auth';
import { getBusinessByOwner } from '@/lib/business';
import { getDb } from '@gcfis/db/client';
import {
  conversations,
  firecrawlJobs,
  knowledgeDocuments,
  memoryFacts,
} from '@gcfis/db/schema';

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

  const db = getDb();
  const [conversationCount, knowledgeCount, memoryCount, crawlCount] = await Promise.all([
    db
      .select({ value: count() })
      .from(conversations)
      .where(eq(conversations.businessId, business.id)),
    db
      .select({ value: count() })
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.businessId, business.id)),
    db
      .select({ value: count() })
      .from(memoryFacts)
      .where(eq(memoryFacts.businessId, business.id)),
    db
      .select({ value: count() })
      .from(firecrawlJobs)
      .where(eq(firecrawlJobs.businessId, business.id)),
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      conversations: conversationCount[0]?.value ?? 0,
      knowledgeDocuments: knowledgeCount[0]?.value ?? 0,
      memoryFacts: memoryCount[0]?.value ?? 0,
      crawlJobs: crawlCount[0]?.value ?? 0,
    },
  });
}