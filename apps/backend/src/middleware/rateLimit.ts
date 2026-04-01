import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

function resolveIdentity(req: Request): string {
  const apiKey = req.header('x-api-key');
  if (apiKey) return `api-key:${apiKey}`;

  const auth = req.header('authorization');
  if (auth?.startsWith('Bearer ')) return `bearer:${auth.slice(7)}`;

  const publicToken = typeof req.body?.publicToken === 'string' ? req.body.publicToken : undefined;
  if (publicToken) return `public-token:${publicToken}`;

  return `ip:${req.ip ?? 'unknown'}`;
}

export const chatRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: resolveIdentity,
  message: {
    ok: false,
    error: 'Rate limit exceeded for chat requests. Try again in a minute.',
  },
});

export const firecrawlRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: resolveIdentity,
  message: {
    ok: false,
    error: 'Rate limit exceeded for firecrawl requests. Try again in a minute.',
  },
});

export const mcpRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: resolveIdentity,
  message: {
    ok: false,
    error: 'Rate limit exceeded for MCP requests. Try again in a minute.',
  },
});
