/**
 * Axios HTTP request tool for safe, allowlisted API and webpage requests.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import axios from 'axios';
import { z } from 'zod';
import { validateSafeAllowedUrl } from './url-security.js';

export interface HttpRequestToolOptions {
  allowedDomains: string[];
  timeoutMs?: number;
}

const REQUEST_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;

const schema = z.object({
  method: z.enum(REQUEST_METHODS).default('GET'),
  url: z.string().url().describe('Full URL for the request.'),
  headers: z.record(z.string()).optional().describe('Optional request headers.'),
  params: z.record(z.string()).optional().describe('Optional query parameters.'),
  body: z.union([z.string(), z.record(z.unknown()), z.array(z.unknown())]).optional(),
  responseType: z
    .enum(['auto', 'json', 'text'])
    .default('auto')
    .describe('How to parse response. auto attempts JSON then falls back to text.'),
});

export function createHttpRequestTool(options: HttpRequestToolOptions): DynamicStructuredTool {
  const timeoutMs = options.timeoutMs ?? 10_000;

  return new DynamicStructuredTool({
    name: 'axios_http_request',
    description:
      'Makes an outbound HTTP request using Axios to allowed domains only. ' +
      'Use for simple API requests, status checks, and fetching lightweight JSON/text data.',
    schema,
    func: async (input: z.infer<typeof schema>) => {
      const urlCheck = validateSafeAllowedUrl(input.url, options.allowedDomains);
      if (!urlCheck.ok) {
        return `Error: ${urlCheck.reason ?? 'URL is blocked.'}`;
      }

      const blockedHeaders = new Set(['host', 'cookie', 'authorization']);
      const sanitizedHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(input.headers ?? {})) {
        if (!blockedHeaders.has(key.toLowerCase())) {
          sanitizedHeaders[key] = value;
        }
      }

      try {
        const response = await axios.request({
          method: input.method,
          url: input.url,
          headers: sanitizedHeaders,
          params: input.params,
          data: input.body,
          timeout: timeoutMs,
          validateStatus: () => true,
          maxContentLength: 250_000,
          maxBodyLength: 250_000,
        });

        const responseHeaders = Object.fromEntries(
          Object.entries(response.headers).filter(([, headerValue]) => typeof headerValue === 'string')
        ) as Record<string, string>;

        let payload: unknown;
        if (input.responseType === 'json') {
          payload = response.data;
        } else if (input.responseType === 'text') {
          payload = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        } else {
          payload = response.data;
        }

        const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
        const MAX_CHARS = 7_000;
        const truncated =
          serialized.length > MAX_CHARS
            ? `${serialized.slice(0, MAX_CHARS)}\n\n[Response truncated at ${MAX_CHARS} characters]`
            : serialized;

        return JSON.stringify(
          {
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            statusText: response.statusText,
            url: input.url,
            method: input.method,
            headers: responseHeaders,
            data: truncated,
          },
          null,
          2
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error: Axios request failed - ${message}`;
      }
    },
  });
}