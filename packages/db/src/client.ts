/**
 * Supabase + Drizzle client factory.
 *
 * Use `getDb()` for Drizzle queries (server-side only).
 * Use `getSupabaseAdmin()` for Supabase Auth admin operations.
 * Use `getSupabaseClient()` for browser-side usage (anon key).
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import * as schema from './schema/index.js';

// ─── Drizzle (server only — uses DATABASE_URL with service role) ──────────────

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Returns a singleton Drizzle DB instance.
 * Call only from server-side code (backend, packages/agent, packages/tools).
 */
export function getDb() {
  if (_db) return _db;

  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const queryClient = postgres(url, {
    // pgvector requires this to be disabled
    prepare: false,
  });

  _db = drizzle(queryClient, { schema });
  return _db;
}

// ─── Supabase Admin (server only — uses SERVICE_ROLE_KEY) ────────────────────

/**
 * Supabase admin client — bypasses RLS.
 * Never expose to the browser.
 */
export function getSupabaseAdmin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Supabase Browser Client (anon key) ──────────────────────────────────────

/**
 * Supabase browser client — uses anon key + RLS.
 * Safe to use in Next.js client components.
 */
export function getSupabaseClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY'];
  if (!url || !key) throw new Error('Supabase public env vars not set');
  return createClient(url, key);
}
