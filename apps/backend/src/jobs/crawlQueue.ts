import { Queue } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';

const CRAWL_QUEUE = 'crawl-job';
const CRAWL_JOB_NAME = 'process';
let queue: Queue<{ jobId: string }> | null = null;
let connection: Redis | null = null;

function isQueueEnabled(): boolean {
  const enabled = process.env['CRAWL_QUEUE_ENABLED'] ?? process.env['FIRECRAWL_QUEUE_ENABLED'];
  return enabled !== 'false';
}

async function getQueue(): Promise<Queue<{ jobId: string }> | null> {
  if (!isQueueEnabled()) return null;
  if (queue) return queue;

  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) {
    console.warn('[crawl-queue] REDIS_URL is not set; queue disabled.');
    return null;
  }

  connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  queue = new Queue<{ jobId: string }>(CRAWL_QUEUE, { connection });
  return queue;
}

export async function enqueueCrawlJob(jobId: string): Promise<boolean> {
  const q = await getQueue();
  if (!q) return false;

  await q.add(CRAWL_JOB_NAME, { jobId }, {
    removeOnComplete: true,
    removeOnFail: 50,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });

  return true;
}

export const enqueueFirecrawlJob = enqueueCrawlJob;
