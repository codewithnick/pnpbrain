import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@gcfis/db/client';
import { firecrawlJobs, knowledgeChunks, knowledgeDocuments } from '@gcfis/db/schema';
import { MemoryService } from '@gcfis/agent/memory';
import { chunkText, getEmbeddingModel, normalizeEmbeddingVector } from '@gcfis/agent/rag';

type CrawledPage = {
  url: string;
  title: string;
  markdown: string;
};

type CrawlDomainPolicy = {
  blockedDomains: string[];
};

type RobotsRules = {
  allow: string[];
  disallow: string[];
};

const robotsCache = new Map<string, RobotsRules>();

function parseCsvList(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function buildDomainPolicy(): CrawlDomainPolicy {
  return {
    blockedDomains: parseCsvList(process.env['CRAWL_BLOCKED_DOMAINS']),
  };
}

function hostMatchesRule(host: string, rule: string): boolean {
  if (!rule) {
    return false;
  }

  if (rule.startsWith('*.')) {
    const suffix = rule.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }

  return host === rule || host.endsWith(`.${rule}`);
}

function isDomainAllowed(url: URL, policy: CrawlDomainPolicy): boolean {
  const host = url.hostname.toLowerCase();

  if (policy.blockedDomains.some((rule) => hostMatchesRule(host, rule))) {
    return false;
  }

  return true;
}

function parseRobotsTxt(content: string, userAgent: string): RobotsRules {
  type Group = {
    agents: string[];
    allow: string[];
    disallow: string[];
  };

  const groups: Group[] = [];
  let currentAgents: string[] = [];
  let currentAllow: string[] = [];
  let currentDisallow: string[] = [];

  const flushCurrent = (): void => {
    if (currentAgents.length === 0 && currentAllow.length === 0 && currentDisallow.length === 0) {
      return;
    }

    groups.push({
      agents: currentAgents.length > 0 ? currentAgents : ['*'],
      allow: currentAllow,
      disallow: currentDisallow,
    });

    currentAgents = [];
    currentAllow = [];
    currentDisallow = [];
  };

  for (const rawLine of content.split('\n')) {
    const line = rawLine.split('#')[0]?.trim();
    if (!line) {
      continue;
    }

    const separator = line.indexOf(':');
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === 'user-agent') {
      if (currentAllow.length > 0 || currentDisallow.length > 0) {
        flushCurrent();
      }
      currentAgents.push(value.toLowerCase());
      continue;
    }

    if (key === 'allow') {
      currentAllow.push(value);
      continue;
    }

    if (key === 'disallow') {
      currentDisallow.push(value);
    }
  }

  flushCurrent();

  const normalizedAgent = userAgent.toLowerCase();
  const matchingGroups = groups.filter(
    (group) =>
      group.agents.includes(normalizedAgent) || group.agents.includes('*')
  );

  return {
    allow: matchingGroups.flatMap((group) => group.allow).filter(Boolean),
    disallow: matchingGroups.flatMap((group) => group.disallow).filter(Boolean),
  };
}

function robotsRuleMatches(path: string, rule: string): boolean {
  if (!rule) {
    return false;
  }

  const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regexPattern = `^${escaped.replace(/\\\*/g, '.*').replace(/\\\$$/g, '$')}`;
  return new RegExp(regexPattern).test(path);
}

function isAllowedByRobots(url: URL, rules: RobotsRules): boolean {
  const pathWithQuery = `${url.pathname}${url.search}`;

  let bestRuleType: 'allow' | 'disallow' | null = null;
  let bestRuleLength = -1;

  for (const rule of rules.disallow) {
    if (!robotsRuleMatches(pathWithQuery, rule)) {
      continue;
    }
    if (rule.length > bestRuleLength) {
      bestRuleLength = rule.length;
      bestRuleType = 'disallow';
    }
  }

  for (const rule of rules.allow) {
    if (!robotsRuleMatches(pathWithQuery, rule)) {
      continue;
    }
    if (rule.length >= bestRuleLength) {
      bestRuleLength = rule.length;
      bestRuleType = 'allow';
    }
  }

  return bestRuleType !== 'disallow';
}

async function getRobotsRulesForOrigin(origin: string, timeoutMs: number): Promise<RobotsRules> {
  const cached = robotsCache.get(origin);
  if (cached) {
    return cached;
  }

  const robotsUrl = `${origin}/robots.txt`;

  try {
    const response = await fetchWithTimeout(robotsUrl, timeoutMs);
    if (!response.ok) {
      const emptyRules: RobotsRules = { allow: [], disallow: [] };
      robotsCache.set(origin, emptyRules);
      return emptyRules;
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('text/plain') && !contentType.includes('text/')) {
      const emptyRules: RobotsRules = { allow: [], disallow: [] };
      robotsCache.set(origin, emptyRules);
      return emptyRules;
    }

    const content = await response.text();
    const parsedRules = parseRobotsTxt(content, 'gcfis-crawlworker');
    robotsCache.set(origin, parsedRules);
    return parsedRules;
  } catch {
    const emptyRules: RobotsRules = { allow: [], disallow: [] };
    robotsCache.set(origin, emptyRules);
    return emptyRules;
  }
}

function sanitizeWhitespace(text: string): string {
  return text.replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function decodeHtmlEntities(value: string): string {
  const entities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };

  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/&#x([\da-fA-F]+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (full, named: string) => entities[named] ?? full);
}

function htmlToMarkdown(html: string): string {
  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');

  const withStructure = withoutNoise
    .replace(/<\/?(h[1-6])\b[^>]*>/gi, '\n\n')
    .replace(/<\/?p\b[^>]*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?li\b[^>]*>/gi, '\n- ')
    .replace(/<\/?(ul|ol)\b[^>]*>/gi, '\n');

  const textOnly = withStructure.replace(/<[^>]+>/g, ' ');
  return sanitizeWhitespace(decodeHtmlEntities(textOnly));
}

function extractTitle(html: string, fallback: string): string {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch?.[1]) {
    return fallback;
  }

  const title = sanitizeWhitespace(decodeHtmlEntities(titleMatch[1]));
  return title || fallback;
}

function extractSameHostLinks(html: string, baseUrl: URL): string[] {
  const links = new Set<string>();
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;

  for (const match of html.matchAll(hrefRegex)) {
    const href = match[1]?.trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      continue;
    }

    try {
      const resolved = new URL(href, baseUrl);
      if (!['http:', 'https:'].includes(resolved.protocol)) {
        continue;
      }
      if (resolved.hostname !== baseUrl.hostname) {
        continue;
      }

      resolved.hash = '';
      links.add(resolved.toString());
    } catch {
      continue;
    }
  }

  return Array.from(links);
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'GCFIS-CrawlWorker/1.0',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function crawlSeedUrl(
  seedUrl: string,
  maxPagesPerSeed: number,
  timeoutMs: number,
  domainPolicy: CrawlDomainPolicy
): Promise<CrawledPage[]> {
  let parsedSeed: URL;
  try {
    parsedSeed = new URL(seedUrl);
  } catch {
    return [];
  }

  if (!['http:', 'https:'].includes(parsedSeed.protocol)) {
    return [];
  }

  if (!isDomainAllowed(parsedSeed, domainPolicy)) {
    return [];
  }

  const queue: string[] = [parsedSeed.toString()];
  const visited = new Set<string>();
  const pages: CrawledPage[] = [];

  while (queue.length > 0 && pages.length < maxPagesPerSeed) {
    const currentUrl = queue.shift();
    if (!currentUrl || visited.has(currentUrl)) {
      continue;
    }
    visited.add(currentUrl);

    let parsedCurrent: URL;
    try {
      parsedCurrent = new URL(currentUrl);
    } catch {
      continue;
    }

    if (!isDomainAllowed(parsedCurrent, domainPolicy)) {
      continue;
    }

    const robotsRules = await getRobotsRulesForOrigin(parsedCurrent.origin, timeoutMs);
    if (!isAllowedByRobots(parsedCurrent, robotsRules)) {
      continue;
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(currentUrl, timeoutMs);
    } catch {
      continue;
    }

    if (!response.ok) {
      continue;
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      continue;
    }

    const body = await response.text();
    const markdown = contentType.includes('text/plain') ? sanitizeWhitespace(body) : htmlToMarkdown(body);
    if (!markdown) {
      continue;
    }

    const title = contentType.includes('text/html')
      ? extractTitle(body, currentUrl)
      : currentUrl;

    pages.push({
      url: currentUrl,
      title,
      markdown,
    });

    if (!contentType.includes('text/html')) {
      continue;
    }

    const base = new URL(currentUrl);
    const links = extractSameHostLinks(body, base);
    for (const link of links) {
      if (!visited.has(link) && queue.length + pages.length < maxPagesPerSeed * 5) {
        queue.push(link);
      }
    }
  }

  return pages;
}

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
    const embeddings = getEmbeddingModel();
    const maxPagesPerSeed = Math.max(
      1,
      Number.parseInt(process.env['CRAWL_MAX_PAGES_PER_SEED'] ?? '10', 10) || 10
    );
    const requestTimeoutMs = Math.max(
      1000,
      Number.parseInt(process.env['CRAWL_REQUEST_TIMEOUT_MS'] ?? '15000', 10) || 15000
    );
    const domainPolicy = buildDomainPolicy();

    for (const seedUrl of urls) {
      let crawledPages: CrawledPage[] = [];
      try {
        crawledPages = await crawlSeedUrl(seedUrl, maxPagesPerSeed, requestTimeoutMs, domainPolicy);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        crawlErrors.push(`${seedUrl} -> ${errorMessage}`);
        continue;
      }

      if (crawledPages.length === 0) {
        crawlErrors.push(`${seedUrl} -> no crawlable pages found`);
        continue;
      }

      for (const page of crawledPages) {
        await db
          .delete(knowledgeDocuments)
          .where(
            and(
              eq(knowledgeDocuments.businessId, businessId),
              eq(knowledgeDocuments.sourceUrl, page.url),
              agentId
                ? eq(knowledgeDocuments.agentId, agentId)
                : isNull(knowledgeDocuments.agentId)
            )
          );

        const chunks = chunkText(page.markdown);
        if (chunks.length === 0) {
          continue;
        }

        const vectors = await embeddings.embedDocuments(chunks.map((chunk) => chunk.content));

        const [doc] = await db
          .insert(knowledgeDocuments)
          .values({
            businessId,
            agentId,
            title: page.title,
            content: page.markdown,
            sourceUrl: page.url,
          })
          .returning();

        ingestedPages += 1;
        ingestedTitles.push(page.title);

        await db.insert(knowledgeChunks).values(
          chunks.map((chunk, index) => ({
            documentId: doc!.id,
            businessId,
            agentId,
            content: chunk.content,
            chunkIndex: chunk.index,
            embedding: normalizeEmbeddingVector(vectors[index] ?? []),
          }))
        );
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
