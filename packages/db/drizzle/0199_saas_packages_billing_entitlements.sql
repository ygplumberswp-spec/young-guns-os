-- Department 21: SaaS packages + entitlements (configurable plans, seats, fair-use hooks).
-- Extends existing saas_* architecture. Staging only — not a production migration.
ALTER TYPE "saas_plan_tier" ADD VALUE IF NOT EXISTS 'business';
--> statement-breakpoint
ALTER TYPE "saas_plan_tier" ADD VALUE IF NOT EXISTS 'pro';
--> statement-breakpoint
ALTER TABLE "saas_subscription_plans"
  ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'ZAR' NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_subscription_plans"
  ADD COLUMN IF NOT EXISTS "pricing_configurable" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_subscription_plans"
  ADD COLUMN IF NOT EXISTS "commercial_config" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_subscriptions"
  ADD COLUMN IF NOT EXISTS "scheduled_plan_id" uuid;
--> statement-breakpoint
ALTER TABLE "saas_subscriptions"
  ADD COLUMN IF NOT EXISTS "scheduled_change_type" text;
--> statement-breakpoint
ALTER TABLE "saas_subscriptions"
  ADD COLUMN IF NOT EXISTS "scheduled_change_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "saas_subscriptions"
  ADD COLUMN IF NOT EXISTS "over_limit_state" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_subscriptions"
  ADD COLUMN IF NOT EXISTS "over_limit_details" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_subscriptions"
  ADD COLUMN IF NOT EXISTS "extra_seat_entitlements" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "saas_subscriptions"
    ADD CONSTRAINT "saas_subscriptions_scheduled_plan_id_saas_subscription_plans_id_fk"
    FOREIGN KEY ("scheduled_plan_id") REFERENCES "public"."saas_subscription_plans"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
