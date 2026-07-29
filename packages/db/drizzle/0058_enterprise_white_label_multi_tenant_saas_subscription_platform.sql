ALTER TYPE "public"."agent_key" ADD VALUE IF NOT EXISTS 'saas';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_saas_onboarding_guide';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_tenant_report';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_plan_recommendation';--> statement-breakpoint
CREATE TYPE "public"."saas_tenant_kind" AS ENUM('platform_owner', 'customer');--> statement-breakpoint
CREATE TYPE "public"."saas_tenant_lifecycle" AS ENUM('provisioning', 'active', 'suspended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."saas_subscription_status" AS ENUM('trial', 'active', 'grace_period', 'suspended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."saas_plan_tier" AS ENUM('free_trial', 'starter', 'professional', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."saas_billing_interval" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."saas_billing_record_type" AS ENUM('invoice', 'payment', 'renewal', 'credit', 'coupon', 'tax');--> statement-breakpoint
CREATE TYPE "public"."saas_billing_record_status" AS ENUM('draft', 'pending', 'paid', 'failed', 'void');--> statement-breakpoint
CREATE TYPE "public"."saas_platform_action_type" AS ENUM(
	'tenant_provision',
	'tenant_suspend',
	'tenant_reactivate',
	'plan_upgrade',
	'plan_downgrade',
	'subscription_cancel',
	'branding_update',
	'feature_flag_update'
);--> statement-breakpoint
CREATE TYPE "public"."saas_platform_action_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TABLE "saas_tenant_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL UNIQUE,
	"tenant_kind" "saas_tenant_kind" DEFAULT 'customer' NOT NULL,
	"lifecycle_status" "saas_tenant_lifecycle" DEFAULT 'provisioning' NOT NULL,
	"branch_label" text,
	"storage_allocation_mb" integer DEFAULT 1024 NOT NULL,
	"ai_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audit_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"security_policy_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provisioned_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "saas_tenant_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_key" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "saas_subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_company_id" uuid NOT NULL,
	"plan_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"tier" "saas_plan_tier" NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"billing_interval" "saas_billing_interval" DEFAULT 'monthly' NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "saas_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL UNIQUE,
	"plan_id" uuid,
	"status" "saas_subscription_status" DEFAULT 'trial' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"grace_period_ends_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "saas_billing_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"subscription_id" uuid,
	"record_type" "saas_billing_record_type" NOT NULL,
	"status" "saas_billing_record_status" DEFAULT 'draft' NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "saas_branding_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL UNIQUE,
	"logo_url" text,
	"company_display_name" text,
	"primary_color" text,
	"secondary_color" text,
	"accent_color" text,
	"email_branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pdf_branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"invoice_branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"portal_branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"login_branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mobile_branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "saas_feature_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"feature_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"limit_value" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "saas_feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_company_id" uuid NOT NULL,
	"flag_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"default_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "saas_tenant_feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"flag_key" text NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "saas_usage_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_count" integer DEFAULT 0 NOT NULL,
	"storage_bytes" integer DEFAULT 0 NOT NULL,
	"api_request_count" integer DEFAULT 0 NOT NULL,
	"ai_usage_count" integer DEFAULT 0 NOT NULL,
	"integration_count" integer DEFAULT 0 NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "saas_platform_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"subject" text NOT NULL,
	"details" text,
	"performed_by_user_id" uuid,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "saas_platform_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" "saas_platform_action_type" NOT NULL,
	"status" "saas_platform_action_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"target_company_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "saas_tenant_profiles" ADD CONSTRAINT "saas_tenant_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_tenant_branches" ADD CONSTRAINT "saas_tenant_branches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_subscription_plans" ADD CONSTRAINT "saas_subscription_plans_owner_company_id_companies_id_fk" FOREIGN KEY ("owner_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_subscriptions" ADD CONSTRAINT "saas_subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_subscriptions" ADD CONSTRAINT "saas_subscriptions_plan_id_saas_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."saas_subscription_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_billing_records" ADD CONSTRAINT "saas_billing_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_billing_records" ADD CONSTRAINT "saas_billing_records_subscription_id_saas_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."saas_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_branding_profiles" ADD CONSTRAINT "saas_branding_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_feature_entitlements" ADD CONSTRAINT "saas_feature_entitlements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_feature_flags" ADD CONSTRAINT "saas_feature_flags_owner_company_id_companies_id_fk" FOREIGN KEY ("owner_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_tenant_feature_flags" ADD CONSTRAINT "saas_tenant_feature_flags_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_usage_snapshots" ADD CONSTRAINT "saas_usage_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_platform_audits" ADD CONSTRAINT "saas_platform_audits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_platform_audits" ADD CONSTRAINT "saas_platform_audits_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_platform_actions" ADD CONSTRAINT "saas_platform_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_platform_actions" ADD CONSTRAINT "saas_platform_actions_target_company_id_companies_id_fk" FOREIGN KEY ("target_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_platform_actions" ADD CONSTRAINT "saas_platform_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saas_tenant_profiles_kind_lifecycle_idx" ON "saas_tenant_profiles" ("tenant_kind","lifecycle_status");--> statement-breakpoint
CREATE INDEX "saas_tenant_branches_company_idx" ON "saas_tenant_branches" ("company_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_subscription_plans_owner_key_idx" ON "saas_subscription_plans" ("owner_company_id","plan_key");--> statement-breakpoint
CREATE INDEX "saas_subscriptions_status_idx" ON "saas_subscriptions" ("status");--> statement-breakpoint
CREATE INDEX "saas_billing_records_company_type_idx" ON "saas_billing_records" ("company_id","record_type");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_feature_entitlements_company_feature_idx" ON "saas_feature_entitlements" ("company_id","feature_key");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_feature_flags_owner_key_idx" ON "saas_feature_flags" ("owner_company_id","flag_key");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_tenant_feature_flags_company_key_idx" ON "saas_tenant_feature_flags" ("company_id","flag_key");--> statement-breakpoint
CREATE INDEX "saas_usage_snapshots_company_captured_idx" ON "saas_usage_snapshots" ("company_id","captured_at");--> statement-breakpoint
CREATE INDEX "saas_platform_audits_company_performed_idx" ON "saas_platform_audits" ("company_id","performed_at");--> statement-breakpoint
CREATE INDEX "saas_platform_actions_company_status_idx" ON "saas_platform_actions" ("company_id","status");
