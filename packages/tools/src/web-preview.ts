/**
 * Lightweight web page preview and iframe generation tools.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import axios from 'axios';
import { z } from 'zod';
import { validateSafeAllowedUrl } from './url-security.js';

export interface WebPreviewToolOptions {
  allowedDomains: string[];
}

function extractFirst(input: string, pattern: RegExp): string | null {
  const match = input.match(pattern);
  const value = match?.[1];
  if (!value) return null;
  return value.trim();
}

function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function createWebPagePreviewTool(options: WebPreviewToolOptions): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'web_page_preview',
    description:
      'Fetches a web page from an allowed domain and returns key preview metadata ' +
      '(title, description, canonical URL, and short text snippet).',
    schema: z.object({
      url: z.string().url().describe('The page URL to preview.'),
    }),
    func: async ({ url }: { url: string }) => {
      const urlCheck = validateSafeAllowedUrl(url, options.allowedDomains);
      if (!urlCheck.ok) {
        return `Error: ${urlCheck.reason ?? 'URL is blocked.'}`;
      }

      try {
        const response = await axios.get(url, {
          timeout: 10_000,
          responseType: 'text',
          validateStatus: () => true,
          maxContentLength: 350_000,
        });

        if (response.status >= 400) {
          return `Error: Could not load page. HTTP ${response.status} ${response.statusText}`;
        }

        const html = typeof response.data === 'string' ? response.data : String(response.data);
        const title = extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
        const description = extractFirst(
          html,
          /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i
        );
        const canonical = extractFirst(
          html,
          /<link[^>]+rel=["']canonical["'][^>]+href=["']([\s\S]*?)["'][^>]*>/i
        );

        const bodyText = stripTags(html);
        const snippet = bodyText.length > 500 ? `${bodyText.slice(0, 500)}...` : bodyText;

        return JSON.stringify(
          {
            ok: true,
            url,
            title,
            description,
            canonical,
            snippet,
          },
          null,
          2
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error: Failed to preview page - ${message}`;
      }
    },
  });
}

export function createIframeEmbedTool(options: WebPreviewToolOptions): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'iframe_embed',
    description:
      'Generates safe iframe embed markup for an allowed URL. ' +
      'Use this when the user asks to display a web page inside an iframe.',
    schema: z.object({
      url: z.string().url().describe('The URL to embed inside the iframe.'),
      width: z.string().optional().describe('Iframe width, e.g. "100%" or "800".'),
      height: z.string().optional().describe('Iframe height, e.g. "600".'),
      title: z.string().optional().describe('Accessible iframe title attribute.'),
      allowFullscreen: z.boolean().optional().default(true),
    }),
    func: async ({
      url,
      width,
      height,
      title,
      allowFullscreen,
    }: {
      url: string;
      width?: string;
      height?: string;
      title?: string;
      allowFullscreen?: boolean;
    }) => {
      const urlCheck = validateSafeAllowedUrl(url, options.allowedDomains);
      if (!urlCheck.ok) {
        return `Error: ${urlCheck.reason ?? 'URL is blocked.'}`;
      }

      const iframeWidth = width?.trim() || '100%';
      const iframeHeight = height?.trim() || '600';
      const iframeTitle = title?.trim() || 'Embedded Web Page';

      const iframeMarkup =
        `<iframe src="${url}" ` +
        `title="${iframeTitle}" ` +
        `width="${iframeWidth}" ` +
        `height="${iframeHeight}" ` +
        `loading="lazy" ` +
        `referrerpolicy="no-referrer" ` +
        `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` +
        `${allowFullscreen ? ' allowfullscreen' : ''}></iframe>`;

      return JSON.stringify(
        {
          ok: true,
          url,
          note:
            'Some sites block embedding with X-Frame-Options or CSP frame-ancestors. If blocked, open in a new tab instead.',
          iframeMarkup,
        },
        null,
        2
      );
    },
  });
}