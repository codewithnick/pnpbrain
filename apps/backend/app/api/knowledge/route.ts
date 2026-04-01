/**
 * GET  /api/knowledge?businessId=xxx        — list all documents for a business
 * POST /api/knowledge                        — create a new knowledge document
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@gcfis/db/client';
import { knowledgeDocuments, knowledgeChunks } from '@gcfis/db/schema';
import { eq } from 'drizzle-orm';
import { corsResponse, requireApiKey, requireSupabaseAuth, badRequest } from '@/lib/auth';
import { chunkText, getEmbeddingModel } from '@gcfis/agent/rag';
import { getBusinessByOwner } from '@/lib/business';

export const runtime = 'nodejs';

async function resolveBusinessScope(
  req: NextRequest,
  requestedBusinessId?: string | null
): Promise<{ businessId: string } | NextResponse> {
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

    return { businessId: business.id };
  }

  const authErr = requireApiKey(req);
  if (authErr) return authErr;

  if (!requestedBusinessId) {
    return badRequest('businessId query param is required');
  }

  return { businessId: requestedBusinessId };
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const scope = await resolveBusinessScope(req, req.nextUrl.searchParams.get('businessId'));
  if (scope instanceof NextResponse) return scope;
  const { businessId } = scope;

  const db = getDb();
  const docs = await db
    .select({
      id: knowledgeDocuments.id,
      title: knowledgeDocuments.title,
      sourceUrl: knowledgeDocuments.sourceUrl,
      createdAt: knowledgeDocuments.createdAt,
      updatedAt: knowledgeDocuments.updatedAt,
    })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.businessId, businessId))
    .orderBy(knowledgeDocuments.createdAt);

  return NextResponse.json({ ok: true, data: docs });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

const CreateDocSchema = z.object({
  businessId: z.string().uuid(),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  sourceUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const parsed = CreateDocSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const scope = await resolveBusinessScope(req, parsed.data.businessId);
  if (scope instanceof NextResponse) return scope;

  const { businessId } = scope;
  const { title, content, sourceUrl } = parsed.data;

  const db = getDb();

  // 1. Insert the document
  const [doc] = await db
    .insert(knowledgeDocuments)
    .values({ businessId, title, content, sourceUrl })
    .returning();

  // 2. Chunk + embed in the background (non-blocking response)
  embedDocument(doc!.id, businessId, content).catch((err) =>
    console.error('[knowledge] embedding failed:', err)
  );

  return NextResponse.json({ ok: true, data: doc }, { status: 201 });
}

// ─── Options ──────────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return corsResponse();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Chunks a document's content, generates embeddings, and saves to knowledge_chunks.
 */
async function embedDocument(
  documentId: string,
  businessId: string,
  content: string
): Promise<void> {
  const chunks = chunkText(content);
  const embeddings = getEmbeddingModel();

  const vectors = await embeddings.embedDocuments(chunks.map((c) => c.content));

  const db = getDb();
  await db.insert(knowledgeChunks).values(
    chunks.map((chunk, i) => ({
      documentId,
      businessId,
      content: chunk.content,
      chunkIndex: chunk.index,
      embedding: vectors[i] ?? [],
    }))
  );
}
