/**
 * POST /api/skills/firecrawl
 *
 * Triggers a background Firecrawl crawl job for a business's allowed domains.
 * The crawled content is chunked + embedded and stored in the knowledge base.
 *
 * Request body:
 *   { businessId: string; urls: string[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import FirecrawlApp from '@mendable/firecrawl-js';
import { getDb } from '@gcfis/db/client';
import { firecrawlJobs, knowledgeChunks, knowledgeDocuments } from '@gcfis/db/schema';
import { eq } from 'drizzle-orm';
import { corsResponse, requireApiKey, requireSupabaseAuth, badRequest } from '@/lib/auth';
import { getBusinessById, getBusinessByOwner, parseAllowedDomains } from '@/lib/business';
import { chunkText, getEmbeddingModel } from '@gcfis/agent/rag';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  businessId: z.string().uuid().optional(),
  urls: z.array(z.string().url()).min(1).max(20),
});

async function resolveBusinessForFirecrawl(
  req: NextRequest,
  businessId?: string
) {
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

    return business;
  }

  const authErr = requireApiKey(req);
  if (authErr) return authErr;

  if (!businessId) {
    return badRequest('businessId is required');
  }

  const business = await getBusinessById(businessId);
  if (!business) return badRequest('Business not found');
  return business;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const { businessId, urls } = parsed.data;

  // Load business + validate domains
  const business = await resolveBusinessForFirecrawl(req, businessId);
  if (business instanceof NextResponse) return business;

  const allowedDomains = parseAllowedDomains(business.allowedDomains);

  // Security: filter out URLs whose hostname is not in allowedDomains
  const safeUrls = urls.filter((url) => {
    try {
      const hostname = new URL(url).hostname;
      return allowedDomains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  });

  if (safeUrls.length === 0) {
    return badRequest('No URLs passed the domain allowlist check');
  }

  // Create a job record
  const db = getDb();
  const [job] = await db
    .insert(firecrawlJobs)
    .values({ businessId: business.id, urls: JSON.stringify(safeUrls), status: 'queued' })
    .returning();

  // Run the crawl in the background
  runFirecrawlJob(job!.id, business.id, safeUrls).catch((err) =>
    console.error('[firecrawl] job failed:', err)
  );

  return NextResponse.json(
    { ok: true, data: { jobId: job!.id, status: 'queued' } },
    { status: 202 }
  );
}

export async function OPTIONS() {
  return corsResponse();
}

// ─── Background job ───────────────────────────────────────────────────────────

async function runFirecrawlJob(
  jobId: string,
  businessId: string,
  urls: string[]
): Promise<void> {
  const db = getDb();

  // Mark as running
  await db
    .update(firecrawlJobs)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(firecrawlJobs.id, jobId));

  try {
    const apiKey = process.env['FIRECRAWL_API_KEY'];
    if (!apiKey) throw new Error('FIRECRAWL_API_KEY not set');

    const firecrawl = new FirecrawlApp({ apiKey });
    const embeddings = getEmbeddingModel();

    for (const url of urls) {
      const result = await firecrawl.scrapeUrl(url, { formats: ['markdown'] });

      if (!result.success || !result.markdown) continue;

      // Insert document
      const title = result.metadata?.title ?? url;
      const [doc] = await db
        .insert(knowledgeDocuments)
        .values({ businessId, title, content: result.markdown, sourceUrl: url })
        .returning();

      // Chunk + embed
      const chunks = chunkText(result.markdown);
      const vectors = await embeddings.embedDocuments(chunks.map((c) => c.content));

      await db.insert(knowledgeChunks).values(
        chunks.map((chunk, i) => ({
          documentId: doc!.id,
          businessId,
          content: chunk.content,
          chunkIndex: chunk.index,
          embedding: vectors[i] ?? [],
        }))
      );
    }

    // Mark as done
    await db
      .update(firecrawlJobs)
      .set({ status: 'done', updatedAt: new Date() })
      .where(eq(firecrawlJobs.id, jobId));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db
      .update(firecrawlJobs)
      .set({ status: 'error', errorMessage, updatedAt: new Date() })
      .where(eq(firecrawlJobs.id, jobId));
    throw err;
  }
}
