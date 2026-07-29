ALTER TYPE "public"."agent_key" ADD VALUE IF NOT EXISTS 'sales';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_sales_follow_up';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_quote_recommendation';--> statement-breakpoint
CREATE TYPE "public"."sales_opportunity_status" AS ENUM('open', 'won', 'lost', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."sales_opportunity_source" AS ENUM('manual', 'detected', 'quote', 'job', 'customer');--> statement-breakpoint
CREATE TYPE "public"."sales_opportunity_type" AS ENUM('recurring_service', 'unconverted_quote', 'incomplete_work', 'maintenance_due', 'high_value_customer', 'follow_up', 'custom');--> statement-breakpoint
CREATE TYPE "public"."sales_activity_type" AS ENUM('call', 'email', 'meeting', 'follow_up', 'quote_sent', 'note', 'other');--> statement-breakpoint
CREATE TYPE "public"."sales_recommendation_type" AS ENUM('follow_up', 'quote_conversion', 'maintenance', 'recurring_service', 'high_value', 'engagement');--> statement-breakpoint
CREATE TYPE "public"."sales_recommendation_status" AS ENUM('pending', 'accepted', 'dismissed', 'completed');--> statement-breakpoint
CREATE TABLE "sales_pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"stage_key" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"probability_percent" integer DEFAULT 0 NOT NULL,
	"is_closed_won" boolean DEFAULT false NOT NULL,
	"is_closed_lost" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "sales_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"stage_id" uuid,
	"opportunity_type" "sales_opportunity_type" DEFAULT 'custom' NOT NULL,
	"source" "sales_opportunity_source" DEFAULT 'manual' NOT NULL,
	"status" "sales_opportunity_status" DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"estimated_value_cents" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"quote_id" uuid,
	"job_id" uuid,
	"assigned_user_id" uuid,
	"detected_reason" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "sales_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"customer_id" uuid NOT NULL,
	"activity_type" "sales_activity_type" DEFAULT 'note' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "sales_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid,
	"recommendation_type" "sales_recommendation_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" "sales_recommendation_status" DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "sales_pipeline_stages" ADD CONSTRAINT "sales_pipeline_stages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_stage_id_sales_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."sales_pipeline_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_opportunity_id_sales_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."sales_opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_recommendations" ADD CONSTRAINT "sales_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_recommendations" ADD CONSTRAINT "sales_recommendations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_pipeline_stages_company_id_idx" ON "sales_pipeline_stages" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_pipeline_stages_company_stage_key_idx" ON "sales_pipeline_stages" USING btree ("company_id","stage_key");--> statement-breakpoint
CREATE INDEX "sales_opportunities_company_id_idx" ON "sales_opportunities" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "sales_opportunities_company_status_idx" ON "sales_opportunities" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "sales_opportunities_customer_id_idx" ON "sales_opportunities" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "sales_activities_company_id_idx" ON "sales_activities" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "sales_activities_opportunity_id_idx" ON "sales_activities" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "sales_activities_customer_id_idx" ON "sales_activities" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "sales_recommendations_company_id_idx" ON "sales_recommendations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "sales_recommendations_company_status_idx" ON "sales_recommendations" USING btree ("company_id","status");
