DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'businesses'
      AND column_name = 'plan_tier'
  ) THEN
    ALTER TABLE "businesses"
    ADD COLUMN "plan_tier" text DEFAULT 'freemium' NOT NULL;
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "businesses"
ALTER COLUMN "credit_balance" SET DEFAULT 200;
--> statement-breakpoint
ALTER TABLE "businesses"
ALTER COLUMN "signup_credits_granted" SET DEFAULT 200;
--> statement-breakpoint
UPDATE "businesses"
SET "plan_tier" = COALESCE(NULLIF("plan_tier", ''), 'freemium')
WHERE "plan_tier" IS NULL OR "plan_tier" = '';
--> statement-breakpoint
UPDATE "businesses"
SET "credit_balance" = 200,
    "signup_credits_granted" = 200,
    "current_period_end" = COALESCE("current_period_end", now() + interval '30 days')
WHERE "plan_tier" = 'freemium' AND "credit_balance" < 1;