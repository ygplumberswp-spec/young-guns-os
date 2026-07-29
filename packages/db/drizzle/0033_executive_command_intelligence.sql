ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_executive_action';--> statement-breakpoint
CREATE TYPE "public"."executive_alert_type" AS ENUM('revenue_decline', 'unpaid_invoices', 'low_margin', 'capacity_issue', 'customer_risk', 'stock_risk', 'operational_issue', 'growth_opportunity');--> statement-breakpoint
CREATE TYPE "public"."executive_alert_status" AS ENUM('pending', 'acknowledged', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."executive_recommendation_type" AS ENUM('growth', 'cost_optimization', 'operational_improvement', 'customer_retention', 'strategic');--> statement-breakpoint
CREATE TYPE "public"."executive_recommendation_status" AS ENUM('pending', 'accepted', 'dismissed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."executive_report_type" AS ENUM('daily_summary', 'weekly_review', 'monthly_review');--> statement-breakpoint
CREATE TYPE "public"."business_health_trend" AS ENUM('improving', 'stable', 'declining', 'unknown');--> statement-breakpoint
CREATE TABLE "business_health_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"overall_score" integer NOT NULL,
	"trend" "business_health_trend" DEFAULT 'unknown' NOT NULL,
	"components" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "executive_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"alert_type" "executive_alert_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" "executive_alert_status" DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "executive_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"recommendation_type" "executive_recommendation_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" "executive_recommendation_status" DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "executive_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"report_type" "executive_report_type" NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "business_health_snapshots" ADD CONSTRAINT "business_health_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_alerts" ADD CONSTRAINT "executive_alerts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_recommendations" ADD CONSTRAINT "executive_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_reports" ADD CONSTRAINT "executive_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_health_snapshots_company_id_idx" ON "business_health_snapshots" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "business_health_snapshots_company_generated_idx" ON "business_health_snapshots" USING btree ("company_id","generated_at");--> statement-breakpoint
CREATE INDEX "executive_alerts_company_id_idx" ON "executive_alerts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "executive_alerts_company_status_idx" ON "executive_alerts" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "executive_recommendations_company_id_idx" ON "executive_recommendations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "executive_recommendations_company_status_idx" ON "executive_recommendations" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "executive_reports_company_id_idx" ON "executive_reports" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "executive_reports_company_type_idx" ON "executive_reports" USING btree ("company_id","report_type");
