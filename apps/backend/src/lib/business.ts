/**
 * Business loader — fetches business config from the DB and caches it briefly.
 * Used by chat + knowledge routes to load allowed domains, bot name, etc.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getDb } from '@pnpbrain/db/client';
import {
  businesses,
} from '@pnpbrain/db/schema';
import { eq, sql } from 'drizzle-orm';
import type { Business } from '@pnpbrain/db';

type CacheEntry = { data: Business; expiresAt: number };

// In-process TTL cache keyed by ID and by slug (good for single-instance dev)
const cacheById   = new Map<string, CacheEntry>();
const cacheBySlug = new Map<string, CacheEntry>();
const TTL_MS = 60_000; // 1 minute

function storeCached(biz: Business): void {
  const entry: CacheEntry = { data: biz, expiresAt: Date.now() + TTL_MS };
  cacheById.set(biz.id, entry);
  cacheBySlug.set(biz.slug, entry);
}

function evict(biz: Business): void {
  cacheById.delete(biz.id);
  cacheBySlug.delete(biz.slug);
}

/**
 * Loads business config by ID, with a short TTL cache.
 *
 * @param businessId - UUID of the business
 * @returns Business row or null if not found
 */
export async function getBusinessById(businessId: string): Promise<Business | null> {
  const cached = cacheById.get(businessId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const db = getDb();
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) return null;

  storeCached(business);
  return business;
}

/**
 * Loads business config by URL slug, with a short TTL cache.
 */
export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  const cached = cacheBySlug.get(slug);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const db = getDb();
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, slug))
    .limit(1);

  if (!business) return null;

  storeCached(business);
  return business;
}

/**
 * Loads business config by owner Supabase user ID.
 */
export async function getBusinessByOwner(ownerUserId: string): Promise<Business | null> {
  const db = getDb();
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.ownerUserId, ownerUserId))
    .limit(1);

  if (!business) return null;

  storeCached(business);
  return business;
}

/**
 * Creates a new business row.
 */
export async function createBusiness(data: {
  name: string;
  slug: string;
  ownerUserId: string;
}): Promise<Business> {
  const db = getDb();
  const [business] = await db
    .insert(businesses)
    .values({
      name: data.name,
      slug: data.slug,
      ownerUserId: data.ownerUserId,
    })
    .returning();
  if (!business) {
    throw new Error('Failed to create business');
  }

  storeCached(business);
  return business;
}

export type UpdateBusinessPayload = Partial<
  Pick<
    Business,
    | 'name'
    | 'slug'
    | 'description'
  >
>;

/**
 * Updates business fields and invalidates the cache entry.
 */
export async function updateBusiness(
  businessId: string,
  payload: UpdateBusinessPayload
): Promise<Business | null> {
  const db = getDb();
  const [updated] = await db
    .update(businesses)
    .set({ ...payload, updatedAt: sql`now()` })
    .where(eq(businesses.id, businessId))
    .returning();

  if (!updated) return null;

  evict(updated);
  storeCached(updated);
  return updated;
}

/**
 * Parses the JSON allowedDomains string stored in the DB.
 */
export function parseAllowedDomains(domains: string): string[] {
  try {
    const parsed: unknown = JSON.parse(domains);
    if (Array.isArray(parsed) && parsed.every((d): d is string => typeof d === 'string')) {
      return normalizeAllowedDomains(parsed);
    }
    return [];
  } catch {
    return [];
  }
}

interface PublicChatTokenPayload {
  type: 'public-chat';
  businessId: string;
  slug: string;
  agentId: string;
  iat: number;
}

const PUBLIC_CHAT_TOKEN_PREFIX = 'pnpbrain_public';
const PUBLIC_CHAT_TOKEN_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function getPublicChatTokenSecret(): string | null {
  return process.env['PUBLIC_CHAT_TOKEN_SECRET']
    ?? process.env['SUPABASE_SERVICE_ROLE_KEY']
    ?? null;
}

export function generatePublicChatToken(
  business: Pick<Business, 'id' | 'slug'>,
  options: { agentId: string }
): string {
  const secret = getPublicChatTokenSecret();
  if (!secret) {
    throw new Error('PUBLIC_CHAT_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY must be configured');
  }

  const payload: PublicChatTokenPayload = {
    type: 'public-chat',
    businessId: business.id,
    slug: business.slug,
    agentId: options.agentId,
    iat: Date.now(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  return `${PUBLIC_CHAT_TOKEN_PREFIX}.${encodedPayload}.${signature}`;
}

export function verifyPublicChatToken(token: string): PublicChatTokenPayload | null {
  const secret = getPublicChatTokenSecret();
  if (!secret || !token.startsWith(`${PUBLIC_CHAT_TOKEN_PREFIX}.`)) {
    return null;
  }

  const [, encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as PublicChatTokenPayload;
    if (payload.type !== 'public-chat' || !payload.businessId || !payload.slug || !payload.agentId || !payload.iat) {
      return null;
    }

    if (typeof payload.agentId !== 'string') {
      return null;
    }

    if (Date.now() - payload.iat > PUBLIC_CHAT_TOKEN_MAX_AGE_MS) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Normalises domain allowlist entries so callers can safely compare against URL hostnames.
 * Accepts either full URLs or bare hostnames and always returns lowercased hostnames.
 */
export function normalizeAllowedDomains(domains: string[]): string[] {
  const unique = new Set<string>();

  for (const value of domains) {
    const normalized = normalizeAllowedDomain(value);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

export function isAllowedHostname(hostname: string, allowedDomains: string[]): boolean {
  const normalizedHostname = hostname.trim().toLowerCase();
  if (!normalizedHostname) {
    return false;
  }

  return allowedDomains.some(
    (domain) => normalizedHostname === domain || normalizedHostname.endsWith(`.${domain}`)
  );
}

function normalizeAllowedDomain(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).hostname;
  } catch {
    return trimmed
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '');
  }
}
