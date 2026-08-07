-- Department 21: Platform Owner SaaS access-control metadata (paid-through / suspension reasons).
-- Entitlement timing continues to use saas_subscriptions.current_period_end as paid-through truth.
ALTER TABLE "saas_tenant_profiles"
  ADD COLUMN IF NOT EXISTS "suspension_reason" text;
--> statement-breakpoint
ALTER TABLE "saas_tenant_profiles"
  ADD COLUMN IF NOT EXISTS "last_access_action" text;
--> statement-breakpoint
ALTER TABLE "saas_tenant_profiles"
  ADD COLUMN IF NOT EXISTS "last_access_action_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "saas_subscriptions"
  ADD COLUMN IF NOT EXISTS "last_payment_failed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "saas_subscriptions"
  ADD COLUMN IF NOT EXISTS "last_payment_failure_reason" text;
--> statement-breakpoint
ALTER TABLE "saas_subscriptions"
  ADD COLUMN IF NOT EXISTS "last_successful_payment_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "saas_subscriptions"
  ADD COLUMN IF NOT EXISTS "payment_provider_ref" text;
--> statement-breakpoint
