ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_business_report';--> statement-breakpoint
CREATE TYPE "public"."business_kpi_key" AS ENUM('revenue', 'gross_profit', 'net_profit', 'cash_flow', 'job_completion_rate', 'technician_utilization', 'customer_retention', 'quote_conversion', 'lead_conversion', 'marketing_roi', 'inventory_turnover', 'procurement_costs', 'customer_satisfaction', 'automation_savings');--> statement-breakpoint
CREATE TYPE "public"."business_dashboard_type" AS ENUM('executive', 'finance', 'operations', 'sales', 'marketing', 'workforce', 'fleet', 'customer_support');--> statement-breakpoint
CREATE TYPE "public"."business_report_status" AS ENUM('draft', 'pending_approval', 'approved', 'scheduled', 'generated', 'archived');--> statement-breakpoint
CREATE TYPE "public"."business_insight_type" AS ENUM('business_trend', 'operational_bottleneck', 'revenue_opportunity', 'cost_optimization', 'customer_behavior', 'workforce_efficiency', 'procurement_optimization', 'automation_effectiveness');--> statement-breakpoint
CREATE TYPE "public"."business_insight_status" AS ENUM('pending', 'accepted', 'dismissed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."predictive_forecast_type" AS ENUM('revenue', 'workload', 'inventory_demand', 'staffing', 'cash_flow', 'customer_churn');--> statement-breakpoint
CREATE TABLE "business_kpis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kpi_key" "business_kpi_key" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_value" integer,
	"unit" text DEFAULT 'count' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "business_kpi_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kpi_id" uuid NOT NULL,
	"kpi_key" "business_kpi_key" NOT NULL,
	"value" integer NOT NULL,
	"previous_value" integer,
	"change_percent" integer,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "business_dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"dashboard_type" "business_dashboard_type" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "dashboard_widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"widget_key" text NOT NULL,
	"title" text NOT NULL,
	"kpi_key" "business_kpi_key",
	"position" integer DEFAULT 0 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "business_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"template_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"status" "business_report_status" DEFAULT 'draft' NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schedule_cron" text,
	"last_generated_at" timestamp with time zone,
	"export_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_summary" text,
	"created_by_user_id" uuid NOT NULL,
	"approved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "report_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"template_key" text NOT NULL,
	"modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "business_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"insight_type" "business_insight_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" "business_insight_status" DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "predictive_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"forecast_type" "predictive_forecast_type" NOT NULL,
	"horizon_start" timestamp with time zone NOT NULL,
	"horizon_end" timestamp with time zone NOT NULL,
	"forecast_value" integer NOT NULL,
	"confidence_percent" integer,
	"summary" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "business_kpis" ADD CONSTRAINT "business_kpis_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_kpi_snapshots" ADD CONSTRAINT "business_kpi_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_kpi_snapshots" ADD CONSTRAINT "business_kpi_snapshots_kpi_id_business_kpis_id_fk" FOREIGN KEY ("kpi_id") REFERENCES "public"."business_kpis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_dashboards" ADD CONSTRAINT "business_dashboards_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_dashboards" ADD CONSTRAINT "business_dashboards_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_dashboard_id_business_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."business_dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_reports" ADD CONSTRAINT "business_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_reports" ADD CONSTRAINT "business_reports_template_id_report_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_reports" ADD CONSTRAINT "business_reports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_reports" ADD CONSTRAINT "business_reports_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_insights" ADD CONSTRAINT "business_insights_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictive_forecasts" ADD CONSTRAINT "predictive_forecasts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_kpis_company_id_idx" ON "business_kpis" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "business_kpis_company_key_idx" ON "business_kpis" USING btree ("company_id","kpi_key");--> statement-breakpoint
CREATE INDEX "business_kpi_snapshots_kpi_id_idx" ON "business_kpi_snapshots" USING btree ("kpi_id");--> statement-breakpoint
CREATE INDEX "business_kpi_snapshots_company_id_idx" ON "business_kpi_snapshots" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "business_dashboards_company_id_idx" ON "business_dashboards" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "dashboard_widgets_dashboard_id_idx" ON "dashboard_widgets" USING btree ("dashboard_id");--> statement-breakpoint
CREATE INDEX "business_reports_company_id_idx" ON "business_reports" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "business_reports_company_status_idx" ON "business_reports" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "report_templates_company_id_idx" ON "report_templates" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "business_insights_company_id_idx" ON "business_insights" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "business_insights_company_status_idx" ON "business_insights" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "predictive_forecasts_company_id_idx" ON "predictive_forecasts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "predictive_forecasts_company_type_idx" ON "predictive_forecasts" USING btree ("company_id","forecast_type");
