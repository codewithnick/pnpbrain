import FirecrawlApp from '@mendable/firecrawl-js';
import { eq } from 'drizzle-orm';
import { getDb } from '@gcfis/db/client';
import { firecrawlJobs, knowledgeChunks, knowledgeDocuments } from '@gcfis/db/schema';
import { chunkText, getEmbeddingModel } from '@gcfis/agent/rag';

export async function processCrawlJob(
  jobId: string,
  businessId: string,
  urls: string[]
): Promise<void> {
  const db = getDb();
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

      const title = result.metadata?.title ?? url;
      const [doc] = await db
        .insert(knowledgeDocuments)
        .values({ businessId, title, content: result.markdown, sourceUrl: url })
        .returning();

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

export const processFirecrawlJob = processCrawlJob;
