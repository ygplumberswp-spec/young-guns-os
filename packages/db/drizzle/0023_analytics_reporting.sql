CREATE TYPE "public"."report_type" AS ENUM(
  'revenue',
  'customer',
  'job_performance',
  'technician_performance',
  'finance',
  'fleet',
  'inventory'
);--> statement-breakpoint
CREATE TYPE "public"."report_run_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."analytics_period" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TABLE "report_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"report_type" "report_type" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "report_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"report_definition_id" uuid,
	"report_type" "report_type" NOT NULL,
	"status" "report_run_status" DEFAULT 'pending' NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"summary" text,
	"error_message" text,
	"generated_by_user_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"snapshot_type" text NOT NULL,
	"period" "analytics_period" NOT NULL,
	"snapshot_date" date NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_report_definition_id_report_definitions_id_fk" FOREIGN KEY ("report_definition_id") REFERENCES "public"."report_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_definitions_company_id_idx" ON "report_definitions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "report_runs_company_id_idx" ON "report_runs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "analytics_snapshots_company_period_idx" ON "analytics_snapshots" USING btree ("company_id", "snapshot_type", "period", "snapshot_date");
