import FirecrawlApp from '@mendable/firecrawl-js';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@pnpbrain/db/client';
import { firecrawlJobs, knowledgeChunks, knowledgeDocuments } from '@pnpbrain/db/schema';
import { MemoryService } from '@pnpbrain/agent/memory';
import { chunkText, getEmbeddingModel, normalizeEmbeddingVector } from '@pnpbrain/agent/rag';

function buildCrawlMemoryFacts(urls: string[], ingestedPages: number, titles: string[]): string[] {
  const hosts = Array.from(
    new Set(
      urls
        .map((url) => {
          try {
            return new URL(url).hostname;
          } catch {
            return null;
          }
        })
        .filter((host): host is string => Boolean(host))
    )
  );

  const facts: string[] = [
    `Agent learned from crawl: scanned ${urls.length} URL(s), ingested ${ingestedPages} page(s), and updated the knowledge base.`,
  ];

  if (hosts.length > 0) {
    facts.push(`Crawl sources included: ${hosts.join(', ')}.`);
  }

  if (titles.length > 0) {
    facts.push(`Recently learned topics: ${titles.slice(0, 3).join(' | ')}.`);
  }

  return facts;
}

export async function processCrawlJob(
  jobId: string,
  businessId: string,
  agentId: string | undefined,
  urls: string[]
): Promise<void> {
  const db = getDb();
  const memoryService = new MemoryService();
  let ingestedPages = 0;
  const ingestedTitles: string[] = [];
  const crawlErrors: string[] = [];

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
      try {
        const result = await firecrawl.scrapeUrl(url, { formats: ['markdown'] });
        if (!result.success || !result.markdown) {
          const reason = result.error ? String(result.error) : 'No markdown returned';
          crawlErrors.push(`${url} -> ${reason}`);
          continue;
        }

        // Keep a single up-to-date document per source URL for this business/agent scope.
        await db
          .delete(knowledgeDocuments)
          .where(
            and(
              eq(knowledgeDocuments.businessId, businessId),
              eq(knowledgeDocuments.sourceUrl, url),
              agentId ? eq(knowledgeDocuments.agentId, agentId) : isNull(knowledgeDocuments.agentId)
            )
          );

        const title = result.metadata?.title ?? url;
        const chunks = chunkText(result.markdown);
        const vectors = await embeddings.embedDocuments(chunks.map((c) => c.content));

        const [doc] = await db
          .insert(knowledgeDocuments)
          .values({ businessId, agentId, title, content: result.markdown, sourceUrl: url })
          .returning();

        ingestedPages += 1;
        ingestedTitles.push(title);

        await db.insert(knowledgeChunks).values(
          chunks.map((chunk, i) => ({
            documentId: doc!.id,
            businessId,
            agentId,
            content: chunk.content,
            chunkIndex: chunk.index,
            embedding: normalizeEmbeddingVector(vectors[i] ?? []),
          }))
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        crawlErrors.push(`${url} -> ${errorMessage}`);
      }
    }

    if (ingestedPages === 0) {
      const details = crawlErrors.slice(0, 5).join(' | ') || 'No pages were ingested.';
      throw new Error(`Crawl failed for all URLs. ${details}`);
    }

    const crawlFacts = buildCrawlMemoryFacts(urls, ingestedPages, ingestedTitles);
    await Promise.all(
      crawlFacts.map((fact) =>
        memoryService.createAgentMemoryFact({
          businessId,
          ...(agentId ? { agentId } : {}),
          fact,
          source: 'crawl',
        })
      )
    );

    await db
      .update(firecrawlJobs)
      .set({
        status: 'done',
        errorMessage: crawlErrors.length > 0 ? `Partial failures: ${crawlErrors.slice(0, 5).join(' | ')}` : null,
        updatedAt: new Date(),
      })
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

export const processFirecrawlJob = processCrawlJob;
