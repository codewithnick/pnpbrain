ALTER TABLE "businesses"
ADD COLUMN "plan_tier" text DEFAULT 'freemium' NOT NULL;
--> statement-breakpoint
ALTER TABLE "businesses"
ALTER COLUMN "credit_balance" SET DEFAULT 200;
--> statement-breakpoint
ALTER TABLE "businesses"
ALTER COLUMN "signup_credits_granted" SET DEFAULT 200;
--> statement-breakpoint
UPDATE "businesses"
SET "plan_tier" = COALESCE(NULLIF("plan_tier", ''), 'freemium');
--> statement-breakpoint
UPDATE "businesses"
SET "credit_balance" = 200,
    "signup_credits_granted" = 200,
    "current_period_end" = COALESCE("current_period_end", now() + interval '30 days')
WHERE "plan_tier" = 'freemium' AND "credit_balance" < 1;