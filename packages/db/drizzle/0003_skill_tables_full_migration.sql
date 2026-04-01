CREATE TABLE IF NOT EXISTS "business_skill_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "skill_name" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "config" text NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "business_skill_settings_skill_name_check"
    CHECK ("skill_name" IN ('calculator', 'datetime', 'firecrawl', 'lead_qualification', 'meeting_scheduler'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "bss_business_skill_unique"
  ON "business_skill_settings" ("business_id", "skill_name");

CREATE TABLE IF NOT EXISTS "business_meeting_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "provider" text NOT NULL DEFAULT 'none',
  "timezone" text,
  "calendar_id" text,
  "calendly_scheduling_url" text,
  "google_access_token" text,
  "google_refresh_token" text,
  "google_access_token_expires_at" timestamptz,
  "zoom_access_token" text,
  "zoom_refresh_token" text,
  "zoom_access_token_expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "business_meeting_integrations_provider_check"
    CHECK ("provider" IN ('none', 'google', 'zoom', 'calendly'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "bmi_business_unique"
  ON "business_meeting_integrations" ("business_id");

INSERT INTO "business_skill_settings" ("business_id", "skill_name", "enabled")
SELECT b."id", s."skill_name", true
FROM "businesses" b
CROSS JOIN LATERAL (
  SELECT value::text AS "skill_name"
  FROM jsonb_array_elements_text(
    CASE
      WHEN b."enabled_skills" IS NULL OR b."enabled_skills" = '' THEN '["calculator","datetime"]'::jsonb
      ELSE b."enabled_skills"::jsonb
    END
  )
) s
ON CONFLICT ("business_id", "skill_name") DO UPDATE
SET "enabled" = EXCLUDED."enabled", "updated_at" = now();

INSERT INTO "business_meeting_integrations" (
  "business_id",
  "provider",
  "timezone",
  "calendar_id",
  "calendly_scheduling_url",
  "google_access_token",
  "google_refresh_token",
  "google_access_token_expires_at",
  "zoom_access_token",
  "zoom_refresh_token",
  "zoom_access_token_expires_at"
)
SELECT
  b."id",
  COALESCE(NULLIF(mi."provider", ''), 'none'),
  NULLIF(mi."timezone", ''),
  NULLIF(mi."calendarId", ''),
  NULLIF(mi."calendlySchedulingUrl", ''),
  NULLIF(mi."googleAccessToken", ''),
  NULLIF(mi."googleRefreshToken", ''),
  CASE WHEN NULLIF(mi."googleAccessTokenExpiresAt", '') IS NULL
    THEN NULL
    ELSE (mi."googleAccessTokenExpiresAt")::timestamptz
  END,
  NULLIF(mi."zoomAccessToken", ''),
  NULLIF(mi."zoomRefreshToken", ''),
  CASE WHEN NULLIF(mi."zoomAccessTokenExpiresAt", '') IS NULL
    THEN NULL
    ELSE (mi."zoomAccessTokenExpiresAt")::timestamptz
  END
FROM "businesses" b
LEFT JOIN LATERAL jsonb_to_record(
  CASE
    WHEN b."meeting_integration" IS NULL OR b."meeting_integration" = '' THEN '{}'::jsonb
    ELSE b."meeting_integration"::jsonb
  END
) AS mi(
  "provider" text,
  "timezone" text,
  "calendarId" text,
  "calendlySchedulingUrl" text,
  "googleAccessToken" text,
  "googleRefreshToken" text,
  "googleAccessTokenExpiresAt" text,
  "zoomAccessToken" text,
  "zoomRefreshToken" text,
  "zoomAccessTokenExpiresAt" text
) ON TRUE
ON CONFLICT ("business_id") DO UPDATE
SET
  "provider" = EXCLUDED."provider",
  "timezone" = EXCLUDED."timezone",
  "calendar_id" = EXCLUDED."calendar_id",
  "calendly_scheduling_url" = EXCLUDED."calendly_scheduling_url",
  "google_access_token" = EXCLUDED."google_access_token",
  "google_refresh_token" = EXCLUDED."google_refresh_token",
  "google_access_token_expires_at" = EXCLUDED."google_access_token_expires_at",
  "zoom_access_token" = EXCLUDED."zoom_access_token",
  "zoom_refresh_token" = EXCLUDED."zoom_refresh_token",
  "zoom_access_token_expires_at" = EXCLUDED."zoom_access_token_expires_at",
  "updated_at" = now();

ALTER TABLE "businesses" DROP COLUMN IF EXISTS "enabled_skills";
ALTER TABLE "businesses" DROP COLUMN IF EXISTS "meeting_integration";
