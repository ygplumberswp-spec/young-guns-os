ALTER TYPE "public"."agent_key" ADD VALUE IF NOT EXISTS 'developer';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_developer_guide';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_integration_guide';--> statement-breakpoint
CREATE TYPE "public"."developer_extension_type" AS ENUM(
	'frontend',
	'backend',
	'ai_agent',
	'workflow',
	'dashboard_widget',
	'report',
	'integration',
	'automation'
);--> statement-breakpoint
CREATE TYPE "public"."developer_extension_status" AS ENUM(
	'draft',
	'pending_approval',
	'approved',
	'installed',
	'disabled',
	'rejected'
);--> statement-breakpoint
CREATE TYPE "public"."developer_marketplace_status" AS ENUM(
	'draft',
	'pending_review',
	'published',
	'rejected',
	'archived'
);--> statement-breakpoint
CREATE TYPE "public"."developer_token_type" AS ENUM('api_key', 'personal_token', 'service_account');--> statement-breakpoint
CREATE TYPE "public"."developer_webhook_subscription_status" AS ENUM('active', 'paused', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."developer_platform_action_type" AS ENUM(
	'extension_install',
	'extension_publish',
	'webhook_subscription',
	'oauth_app_create',
	'sdk_generate',
	'integration_guide'
);--> statement-breakpoint
CREATE TYPE "public"."developer_platform_action_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TABLE "developer_platform_extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"extension_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"extension_type" "developer_extension_type" NOT NULL,
	"status" "developer_extension_status" DEFAULT 'draft' NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"installed_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "developer_platform_extension_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"extension_id" uuid NOT NULL,
	"version" text NOT NULL,
	"changelog" text,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "developer_platform_marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"extension_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"status" "developer_marketplace_status" DEFAULT 'draft' NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"average_rating" double precision,
	"review_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "developer_platform_oauth_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_hash" text NOT NULL,
	"redirect_uris" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "developer_platform_personal_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "developer_platform_service_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "developer_platform_webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_url" text NOT NULL,
	"event_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secret_hash" text NOT NULL,
	"secret_prefix" text NOT NULL,
	"status" "developer_webhook_subscription_status" DEFAULT 'active' NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "developer_platform_webhook_dead_letter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"subscription_id" uuid,
	"event_type" text NOT NULL,
	"payload_summary" text,
	"error_message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "developer_platform_api_changelog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"change_type" text NOT NULL,
	"released_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "developer_platform_sdk_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"language" text NOT NULL,
	"version" text NOT NULL,
	"package_name" text NOT NULL,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "developer_platform_openapi_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"spec" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "developer_platform_auth_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"token_type" "developer_token_type" NOT NULL,
	"action_type" text NOT NULL,
	"subject" text NOT NULL,
	"performed_by_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "developer_platform_analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"api_request_count" integer DEFAULT 0 NOT NULL,
	"api_error_count" integer DEFAULT 0 NOT NULL,
	"avg_latency_ms" integer,
	"webhook_delivery_count" integer DEFAULT 0 NOT NULL,
	"webhook_failure_count" integer DEFAULT 0 NOT NULL,
	"extension_usage_count" integer DEFAULT 0 NOT NULL,
	"sdk_download_count" integer DEFAULT 0 NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "developer_platform_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" "developer_platform_action_type" NOT NULL,
	"status" "developer_platform_action_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extension_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "developer_platform_extensions" ADD CONSTRAINT "developer_platform_extensions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_extensions" ADD CONSTRAINT "developer_platform_extensions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_extension_versions" ADD CONSTRAINT "developer_platform_extension_versions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_extension_versions" ADD CONSTRAINT "developer_platform_extension_versions_extension_id_developer_platform_extensions_id_fk" FOREIGN KEY ("extension_id") REFERENCES "public"."developer_platform_extensions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_marketplace_listings" ADD CONSTRAINT "developer_platform_marketplace_listings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_marketplace_listings" ADD CONSTRAINT "developer_platform_marketplace_listings_extension_id_developer_platform_extensions_id_fk" FOREIGN KEY ("extension_id") REFERENCES "public"."developer_platform_extensions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_marketplace_listings" ADD CONSTRAINT "developer_platform_marketplace_listings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_oauth_applications" ADD CONSTRAINT "developer_platform_oauth_applications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_oauth_applications" ADD CONSTRAINT "developer_platform_oauth_applications_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_personal_access_tokens" ADD CONSTRAINT "developer_platform_personal_access_tokens_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_personal_access_tokens" ADD CONSTRAINT "developer_platform_personal_access_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_service_accounts" ADD CONSTRAINT "developer_platform_service_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_service_accounts" ADD CONSTRAINT "developer_platform_service_accounts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_webhook_subscriptions" ADD CONSTRAINT "developer_platform_webhook_subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_webhook_subscriptions" ADD CONSTRAINT "developer_platform_webhook_subscriptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_webhook_dead_letter" ADD CONSTRAINT "developer_platform_webhook_dead_letter_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_webhook_dead_letter" ADD CONSTRAINT "developer_platform_webhook_dead_letter_subscription_id_developer_platform_webhook_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."developer_platform_webhook_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_api_changelog" ADD CONSTRAINT "developer_platform_api_changelog_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_sdk_packages" ADD CONSTRAINT "developer_platform_sdk_packages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_openapi_specs" ADD CONSTRAINT "developer_platform_openapi_specs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_auth_audit_log" ADD CONSTRAINT "developer_platform_auth_audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_auth_audit_log" ADD CONSTRAINT "developer_platform_auth_audit_log_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_analytics_snapshots" ADD CONSTRAINT "developer_platform_analytics_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_actions" ADD CONSTRAINT "developer_platform_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_actions" ADD CONSTRAINT "developer_platform_actions_extension_id_developer_platform_extensions_id_fk" FOREIGN KEY ("extension_id") REFERENCES "public"."developer_platform_extensions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_platform_actions" ADD CONSTRAINT "developer_platform_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "developer_platform_extensions_company_key_idx" ON "developer_platform_extensions" ("company_id","extension_key");--> statement-breakpoint
CREATE UNIQUE INDEX "developer_platform_oauth_applications_client_id_idx" ON "developer_platform_oauth_applications" ("client_id");--> statement-breakpoint
CREATE INDEX "developer_platform_marketplace_listings_company_status_idx" ON "developer_platform_marketplace_listings" ("company_id","status");--> statement-breakpoint
CREATE INDEX "developer_platform_webhook_subscriptions_company_status_idx" ON "developer_platform_webhook_subscriptions" ("company_id","status");
