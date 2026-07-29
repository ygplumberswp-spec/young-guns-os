ALTER TYPE "public"."agent_key" ADD VALUE IF NOT EXISTS 'business_intelligence';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_strategic_report';--> statement-breakpoint
ALTER TYPE "public"."business_kpi_key" ADD VALUE IF NOT EXISTS 'fleet_efficiency';--> statement-breakpoint
ALTER TYPE "public"."business_kpi_key" ADD VALUE IF NOT EXISTS 'ai_performance';--> statement-breakpoint
ALTER TYPE "public"."business_dashboard_type" ADD VALUE IF NOT EXISTS 'branch';--> statement-breakpoint
ALTER TYPE "public"."business_dashboard_type" ADD VALUE IF NOT EXISTS 'personal';--> statement-breakpoint
ALTER TYPE "public"."business_dashboard_type" ADD VALUE IF NOT EXISTS 'dispatch';--> statement-breakpoint
ALTER TYPE "public"."business_dashboard_type" ADD VALUE IF NOT EXISTS 'procurement';--> statement-breakpoint
ALTER TYPE "public"."business_dashboard_type" ADD VALUE IF NOT EXISTS 'hr';--> statement-breakpoint
ALTER TYPE "public"."business_dashboard_type" ADD VALUE IF NOT EXISTS 'inventory';--> statement-breakpoint
ALTER TYPE "public"."business_dashboard_type" ADD VALUE IF NOT EXISTS 'ai';--> statement-breakpoint
ALTER TYPE "public"."predictive_forecast_type" ADD VALUE IF NOT EXISTS 'demand';--> statement-breakpoint
ALTER TYPE "public"."predictive_forecast_type" ADD VALUE IF NOT EXISTS 'lead_scoring';--> statement-breakpoint
ALTER TYPE "public"."predictive_forecast_type" ADD VALUE IF NOT EXISTS 'risk';--> statement-breakpoint
CREATE TYPE "public"."analytics_data_module" AS ENUM(
	'finance',
	'sales',
	'marketing',
	'operations',
	'dispatch',
	'fleet',
	'inventory',
	'procurement',
	'hr',
	'customer_success',
	'ai',
	'productivity'
);--> statement-breakpoint
CREATE TYPE "public"."analytics_permission_scope" AS ENUM('read', 'write', 'admin');--> statement-breakpoint
CREATE TYPE "public"."analytics_platform_action_type" AS ENUM(
	'strategic_report',
	'kpi_recommendation',
	'forecast_review',
	'governance_action'
);--> statement-breakpoint
CREATE TYPE "public"."analytics_platform_action_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TABLE "analytics_data_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module" "analytics_data_module" NOT NULL,
	"snapshot_key" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "analytics_data_lineage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_module" "analytics_data_module" NOT NULL,
	"target_module" "analytics_data_module" NOT NULL,
	"transformation" text NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "analytics_aggregation_cursors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module" "analytics_data_module" NOT NULL,
	"cursor_key" text NOT NULL,
	"last_aggregated_at" timestamp with time zone,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "analytics_dataset_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"dataset_key" text NOT NULL,
	"permission" "analytics_permission_scope" DEFAULT 'read' NOT NULL,
	"role_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "analytics_report_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"report_id" uuid,
	"template_key" text,
	"permission" "analytics_permission_scope" DEFAULT 'read' NOT NULL,
	"role_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "analytics_access_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "analytics_retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"dataset_key" text NOT NULL,
	"retention_days" integer DEFAULT 365 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "analytics_saved_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"dashboard_type" "business_dashboard_type" NOT NULL,
	"name" text NOT NULL,
	"layout" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "analytics_platform_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" "analytics_platform_action_type" NOT NULL,
	"status" "analytics_platform_action_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "analytics_data_snapshots" ADD CONSTRAINT "analytics_data_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_data_lineage" ADD CONSTRAINT "analytics_data_lineage_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_aggregation_cursors" ADD CONSTRAINT "analytics_aggregation_cursors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_dataset_permissions" ADD CONSTRAINT "analytics_dataset_permissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_dataset_permissions" ADD CONSTRAINT "analytics_dataset_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_dataset_permissions" ADD CONSTRAINT "analytics_dataset_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_report_permissions" ADD CONSTRAINT "analytics_report_permissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_report_permissions" ADD CONSTRAINT "analytics_report_permissions_report_id_business_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."business_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_report_permissions" ADD CONSTRAINT "analytics_report_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_report_permissions" ADD CONSTRAINT "analytics_report_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_access_audit" ADD CONSTRAINT "analytics_access_audit_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_access_audit" ADD CONSTRAINT "analytics_access_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_retention_policies" ADD CONSTRAINT "analytics_retention_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_saved_layouts" ADD CONSTRAINT "analytics_saved_layouts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_saved_layouts" ADD CONSTRAINT "analytics_saved_layouts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_platform_actions" ADD CONSTRAINT "analytics_platform_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_platform_actions" ADD CONSTRAINT "analytics_platform_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_data_snapshots_company_module_idx" ON "analytics_data_snapshots" ("company_id","module","generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_aggregation_cursors_company_module_key_idx" ON "analytics_aggregation_cursors" ("company_id","module","cursor_key");--> statement-breakpoint
CREATE INDEX "analytics_access_audit_company_occurred_idx" ON "analytics_access_audit" ("company_id","occurred_at");
