ALTER TYPE "public"."agent_key" ADD VALUE IF NOT EXISTS 'integration';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_integration_repair';--> statement-breakpoint
ALTER TYPE "public"."integration_sync_job_type" ADD VALUE IF NOT EXISTS 'incremental';--> statement-breakpoint
ALTER TYPE "public"."integration_sync_job_type" ADD VALUE IF NOT EXISTS 'full';--> statement-breakpoint
ALTER TYPE "public"."integration_sync_job_type" ADD VALUE IF NOT EXISTS 'event_driven';--> statement-breakpoint
CREATE TYPE "public"."integration_connector_category" AS ENUM(
	'accounting',
	'payments',
	'fleet',
	'crm',
	'marketing',
	'email',
	'calendar',
	'messaging',
	'storage',
	'ai',
	'erp',
	'hr_payroll',
	'ecommerce',
	'custom'
);--> statement-breakpoint
CREATE TYPE "public"."integration_connector_auth_type" AS ENUM(
	'oauth2',
	'api_key',
	'basic_auth',
	'bearer_token',
	'webhook',
	'custom'
);--> statement-breakpoint
CREATE TYPE "public"."integration_connector_sync_mode" AS ENUM('scheduled', 'manual', 'event_driven');--> statement-breakpoint
CREATE TYPE "public"."integration_connector_status" AS ENUM('disconnected', 'pending', 'connected', 'error');--> statement-breakpoint
CREATE TYPE "public"."integration_sync_scope_type" AS ENUM('incremental', 'full', 'event_driven');--> statement-breakpoint
CREATE TYPE "public"."integration_sync_conflict_status" AS ENUM('detected', 'resolved', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."integration_platform_action_type" AS ENUM(
	'integration_repair',
	'reconnect_recommendation',
	'sync_retry',
	'credential_rotation'
);--> statement-breakpoint
CREATE TYPE "public"."integration_platform_action_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TYPE "public"."integration_diagnostic_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "integration_connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"connector_key" text NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"name" text NOT NULL,
	"category" "integration_connector_category" NOT NULL,
	"auth_type" "integration_connector_auth_type" NOT NULL,
	"sync_mode" "integration_connector_sync_mode" DEFAULT 'manual' NOT NULL,
	"status" "integration_connector_status" DEFAULT 'disconnected' NOT NULL,
	"connection_id" uuid,
	"supports_webhooks" boolean DEFAULT false NOT NULL,
	"supports_scheduled_sync" boolean DEFAULT true NOT NULL,
	"api_version" text DEFAULT 'v1',
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "integration_api_gateway_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"trace_id" text NOT NULL,
	"route_key" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status_code" integer,
	"duration_ms" integer,
	"api_version" text,
	"user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "integration_sync_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"connector_id" uuid NOT NULL,
	"sync_scope" "integration_sync_scope_type" DEFAULT 'incremental' NOT NULL,
	"frequency_minutes" integer DEFAULT 60 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "integration_sync_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"connector_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"conflict_type" text NOT NULL,
	"status" "integration_sync_conflict_status" DEFAULT 'detected' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "integration_platform_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" "integration_platform_action_type" NOT NULL,
	"status" "integration_platform_action_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "integration_developer_diagnostics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"connector_id" uuid,
	"diagnostic_type" text NOT NULL,
	"status" "integration_diagnostic_status" DEFAULT 'pending' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "integration_connectors" ADD CONSTRAINT "integration_connectors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connectors" ADD CONSTRAINT "integration_connectors_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_api_gateway_traces" ADD CONSTRAINT "integration_api_gateway_traces_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_api_gateway_traces" ADD CONSTRAINT "integration_api_gateway_traces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_schedules" ADD CONSTRAINT "integration_sync_schedules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_schedules" ADD CONSTRAINT "integration_sync_schedules_connector_id_integration_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."integration_connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_conflicts" ADD CONSTRAINT "integration_sync_conflicts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_conflicts" ADD CONSTRAINT "integration_sync_conflicts_connector_id_integration_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."integration_connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_platform_actions" ADD CONSTRAINT "integration_platform_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_platform_actions" ADD CONSTRAINT "integration_platform_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_developer_diagnostics" ADD CONSTRAINT "integration_developer_diagnostics_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_developer_diagnostics" ADD CONSTRAINT "integration_developer_diagnostics_connector_id_integration_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."integration_connectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_developer_diagnostics" ADD CONSTRAINT "integration_developer_diagnostics_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connectors_company_key_idx" ON "integration_connectors" ("company_id","connector_key");--> statement-breakpoint
CREATE INDEX "integration_api_gateway_traces_company_occurred_idx" ON "integration_api_gateway_traces" ("company_id","occurred_at");--> statement-breakpoint
CREATE INDEX "integration_sync_schedules_connector_idx" ON "integration_sync_schedules" ("connector_id");
