-- Migration: Add business_members and invitations tables for RBAC
-- Run this against your PostgreSQL database, then update drizzle meta journal.

-- ─── business_members ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "business_members" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "user_id"     text NOT NULL,
  "email"       text NOT NULL DEFAULT '',
  "role"        text NOT NULL CHECK ("role" IN ('owner', 'admin', 'member', 'viewer')),
  "invited_by"  text,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "bm_business_user_unique" UNIQUE ("business_id", "user_id")
);

-- Back-fill owner memberships for all existing businesses
INSERT INTO "business_members" ("business_id", "user_id", "email", "role")
SELECT "id", "owner_user_id", '', 'owner'
FROM "businesses"
ON CONFLICT ON CONSTRAINT "bm_business_user_unique" DO NOTHING;

-- ─── invitations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "invitations" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "email"       text NOT NULL,
  "role"        text NOT NULL CHECK ("role" IN ('admin', 'member', 'viewer')),
  "token"       text NOT NULL UNIQUE,
  "invited_by"  text NOT NULL,
  "expires_at"  timestamptz NOT NULL,
  "accepted_at" timestamptz,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);
