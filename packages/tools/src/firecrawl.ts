/**
 * Firecrawl tool — wraps Firecrawl's scrape/crawl API as a LangGraph DynamicStructuredTool.
 *
 * Security: only URLs whose hostname matches an entry in `allowedDomains` are
 * ever sent to Firecrawl.  The allowed domains are configured by the business
 * owner inside the admin dashboard and stored in the `businesses` table.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import FirecrawlApp from '@mendable/firecrawl-js';
import { z } from 'zod';

export interface FirecrawlToolOptions {
  /** Firecrawl API key — read from env or passed explicitly */
  apiKey?: string;
  /**
   * Domain allowlist enforced at runtime.
   * No request will be sent to Firecrawl unless the URL's hostname is in this list.
   */
  allowedDomains: string[];
}

/**
 * Creates a Firecrawl scraping tool that is safe to expose to the LangGraph agent.
 *
 * @param options - Configuration including domain allowlist
 * @returns A DynamicStructuredTool ready to bind to the agent graph
 */
export function createFirecrawlTool(options: FirecrawlToolOptions): DynamicStructuredTool {
  const apiKey = options.apiKey ?? process.env['FIRECRAWL_API_KEY'];
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY is not set');

  const firecrawl = new FirecrawlApp({ apiKey });
  const allowedDomains = options.allowedDomains.map((domain) => domain.toLowerCase());

  return new DynamicStructuredTool({
    name: 'firecrawl_scrape',
    description:
      'Scrapes a web page and returns its cleaned Markdown content. ' +
      'Use this when you need up-to-date information from the business website. ' +
      `Only URLs from these domains are allowed: ${options.allowedDomains.join(', ')}.`,
    schema: z.object({
      url: z
        .string()
        .url()
        .describe('The full URL to scrape, e.g. https://example.com/products'),
    }),
    func: async ({ url }: { url: string }) => {
      // ── Domain allowlist check ─────────────────────────────────────────────
      let hostname: string;
      try {
        hostname = new URL(url).hostname;
      } catch {
        return 'Error: Invalid URL provided.';
      }

      const normalizedHostname = hostname.toLowerCase();
      const isAllowed = allowedDomains.some(
        (domain) => normalizedHostname === domain || normalizedHostname.endsWith(`.${domain}`)
      );

      if (!isAllowed) {
        return (
          `Error: Domain "${hostname}" is not in the allowed list. ` +
          `Allowed domains: ${allowedDomains.join(', ')}.`
        );
      }

      // ── Scrape via Firecrawl ───────────────────────────────────────────────
      try {
        const result = await firecrawl.scrapeUrl(url, {
          formats: ['markdown'],
        });

        if (!result.success) {
          return `Error: Firecrawl could not scrape the page. ${String(result.error ?? '')}`;
        }

        const markdown = result.markdown ?? '';
        // Truncate to avoid overwhelming the context window
        const MAX_CHARS = 8_000;
        return markdown.length > MAX_CHARS
          ? `${markdown.slice(0, MAX_CHARS)}\n\n[Content truncated at ${MAX_CHARS} characters]`
          : markdown;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return `Error: Firecrawl threw an exception: ${message}`;
      }
    },
  });
}
