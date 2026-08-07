-- Department 21: Plug-and-play SaaS onboarding wizard state (staging only).
-- Extends saas_tenant_profiles — no demo data, no parallel tenant system.
ALTER TABLE "saas_tenant_profiles"
  ADD COLUMN IF NOT EXISTS "onboarding_status" text DEFAULT 'not_started' NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_tenant_profiles"
  ADD COLUMN IF NOT EXISTS "onboarding_current_step" text DEFAULT 'company' NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_tenant_profiles"
  ADD COLUMN IF NOT EXISTS "onboarding_checklist" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_tenant_profiles"
  ADD COLUMN IF NOT EXISTS "onboarding_trade_type" text;
--> statement-breakpoint
ALTER TABLE "saas_tenant_profiles"
  ADD COLUMN IF NOT EXISTS "onboarding_skipped_integrations" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_tenant_profiles"
  ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "saas_tenant_profiles"
  ADD COLUMN IF NOT EXISTS "last_onboarding_activity_at" timestamp with time zone;
--> statement-breakpoint
