import { UnrecoverableError, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { getDb } from '@gcfis/db/client';
import { firecrawlJobs } from '@gcfis/db/schema';
import { processCrawlJob } from './jobs/crawlRunner';

type CrawlJobData = {
  jobId?: string;
};

function loadWorkerEnv(): void {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, '.env'),
    path.resolve(cwd, '.env.local'),
    path.resolve(cwd, '../../.env'),
    path.resolve(cwd, '../../.env.local'),
  ];

  for (const envPath of candidates) {
    loadDotenv({ path: envPath, override: false });
  }
}

function resolveRedisUrl(): string | null {
  const explicitRedisUrl = process.env['REDIS_URL'];
  if (explicitRedisUrl) {
    return explicitRedisUrl;
  }

  const upstashRestUrl = process.env['UPSTASH_REDIS_REST_URL'];
  const upstashRestToken = process.env['UPSTASH_REDIS_REST_TOKEN'];
  if (!upstashRestUrl || !upstashRestToken) {
    return null;
  }

  try {
    const parsed = new URL(upstashRestUrl);
    return `rediss://:${encodeURIComponent(upstashRestToken)}@${parsed.hostname}:6379`;
  } catch {
    return null;
  }
}

const CRAWL_QUEUE = 'crawl-job';
loadWorkerEnv();
const redisUrl = resolveRedisUrl();

function isPermanentCrawlFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return (
    normalized.includes('crawl failed for all urls') ||
    normalized.includes('no crawlable pages found') ||
    normalized.includes('expected 1536 dimensions')
  );
}

if (!redisUrl) {
  throw new Error('REDIS_URL or UPSTASH_REDIS_REST_* is required for crawl worker');
}

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const concurrency = Number.parseInt(
  process.env['CRAWL_WORKER_CONCURRENCY'] ?? process.env['FIRECRAWL_WORKER_CONCURRENCY'] ?? '3',
  10
);

const worker = new Worker<CrawlJobData>(
  CRAWL_QUEUE,
  async (job: Job<CrawlJobData>) => {
    const jobId = job.data.jobId;
    if (!jobId) {
      throw new Error('Missing jobId in queue payload');
    }

    const db = getDb();
    const [record] = await db
      .select({
        id: firecrawlJobs.id,
        businessId: firecrawlJobs.businessId,
        agentId: firecrawlJobs.agentId,
        urls: firecrawlJobs.urls,
      })
      .from(firecrawlJobs)
      .where(eq(firecrawlJobs.id, jobId))
      .limit(1);

    if (!record) {
      return;
    }

    let urls: string[] = [];
    try {
      const parsed: unknown = JSON.parse(record.urls);
      if (Array.isArray(parsed)) {
        urls = parsed.filter((value): value is string => typeof value === 'string');
      }
    } catch {
      urls = [];
    }

    if (urls.length === 0) {
      await db
        .update(firecrawlJobs)
        .set({ status: 'error', errorMessage: 'No valid URLs in job payload', updatedAt: new Date() })
        .where(eq(firecrawlJobs.id, jobId));
      return;
    }

    try {
      await processCrawlJob(record.id, record.businessId, record.agentId ?? undefined, urls);
    } catch (error) {
      if (isPermanentCrawlFailure(error)) {
        throw new UnrecoverableError(error instanceof Error ? error.message : String(error));
      }

      throw error;
    }
  },
  { connection, concurrency: Number.isNaN(concurrency) ? 3 : Math.max(1, concurrency) }
);

worker.on('ready', () => {
  console.log(`[crawl-worker] listening on queue: ${CRAWL_QUEUE}`);
});

worker.on('completed', (job) => {
  console.log(`[crawl-worker] completed ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`[crawl-worker] failed ${job?.id ?? 'unknown'}:`, err);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[crawl-worker] received ${signal}, shutting down...`);
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGINT', () => {
  shutdown('SIGINT').catch((err: unknown) => {
    console.error('[crawl-worker] shutdown error:', err);
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch((err: unknown) => {
    console.error('[crawl-worker] shutdown error:', err);
    process.exit(1);
  });
});
