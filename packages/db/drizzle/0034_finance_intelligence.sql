ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_finance_action';--> statement-breakpoint
CREATE TYPE "public"."finance_budget_period_type" AS ENUM('monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."finance_budget_status" AS ENUM('draft', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."finance_recommendation_type" AS ENUM('pricing', 'margin', 'expense_reduction', 'collections', 'cash_flow', 'risk');--> statement-breakpoint
CREATE TYPE "public"."finance_recommendation_status" AS ENUM('pending', 'accepted', 'dismissed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."finance_forecast_type" AS ENUM('weekly', 'monthly');--> statement-breakpoint
CREATE TABLE "finance_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"period_type" "finance_budget_period_type" DEFAULT 'monthly' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" "finance_budget_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "finance_budget_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"category_key" text NOT NULL,
	"category_name" text NOT NULL,
	"budgeted_amount_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "finance_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"recommendation_type" "finance_recommendation_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" "finance_recommendation_status" DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "finance_forecast_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"forecast_type" "finance_forecast_type" NOT NULL,
	"horizon_start" timestamp with time zone NOT NULL,
	"horizon_end" timestamp with time zone NOT NULL,
	"receivable_forecast_cents" integer DEFAULT 0 NOT NULL,
	"payable_forecast_cents" integer DEFAULT 0 NOT NULL,
	"net_position_cents" integer DEFAULT 0 NOT NULL,
	"summary" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "finance_budgets" ADD CONSTRAINT "finance_budgets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_budget_lines" ADD CONSTRAINT "finance_budget_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_budget_lines" ADD CONSTRAINT "finance_budget_lines_budget_id_finance_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."finance_budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_recommendations" ADD CONSTRAINT "finance_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_forecast_snapshots" ADD CONSTRAINT "finance_forecast_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_budgets_company_id_idx" ON "finance_budgets" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "finance_budgets_company_status_idx" ON "finance_budgets" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "finance_budget_lines_budget_id_idx" ON "finance_budget_lines" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "finance_budget_lines_company_id_idx" ON "finance_budget_lines" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "finance_recommendations_company_id_idx" ON "finance_recommendations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "finance_recommendations_company_status_idx" ON "finance_recommendations" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "finance_forecast_snapshots_company_id_idx" ON "finance_forecast_snapshots" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "finance_forecast_snapshots_company_type_idx" ON "finance_forecast_snapshots" USING btree ("company_id","forecast_type");
