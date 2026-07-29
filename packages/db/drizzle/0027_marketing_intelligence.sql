ALTER TYPE "public"."agent_key" ADD VALUE IF NOT EXISTS 'marketing';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_marketing_campaign';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_marketing_content';--> statement-breakpoint
CREATE TYPE "public"."marketing_campaign_status" AS ENUM('draft', 'active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."marketing_campaign_type" AS ENUM('retention', 'maintenance', 'seasonal', 'engagement', 'acquisition', 'custom');--> statement-breakpoint
CREATE TYPE "public"."marketing_activity_type" AS ENUM('email_draft', 'content', 'outreach', 'social_draft', 'note', 'other');--> statement-breakpoint
CREATE TYPE "public"."marketing_recommendation_type" AS ENUM('maintenance_reminder', 'service_interest', 'follow_up_campaign', 'seasonal', 'retention', 'engagement', 'content');--> statement-breakpoint
CREATE TYPE "public"."marketing_recommendation_status" AS ENUM('pending', 'accepted', 'dismissed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."marketing_segment_type" AS ENUM('high_value', 'repeat_service', 'dormant', 'new_customer', 'high_engagement', 'custom');--> statement-breakpoint
CREATE TABLE "marketing_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"segment_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"segment_type" "marketing_segment_type" DEFAULT 'custom' NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "marketing_campaign_status" DEFAULT 'draft' NOT NULL,
	"campaign_type" "marketing_campaign_type" DEFAULT 'custom' NOT NULL,
	"target_segment_key" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "marketing_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"campaign_id" uuid,
	"customer_id" uuid,
	"activity_type" "marketing_activity_type" DEFAULT 'note' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "marketing_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid,
	"recommendation_type" "marketing_recommendation_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" "marketing_recommendation_status" DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "marketing_segments" ADD CONSTRAINT "marketing_segments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_segments" ADD CONSTRAINT "marketing_segments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_activities" ADD CONSTRAINT "marketing_activities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_activities" ADD CONSTRAINT "marketing_activities_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_activities" ADD CONSTRAINT "marketing_activities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_activities" ADD CONSTRAINT "marketing_activities_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_recommendations" ADD CONSTRAINT "marketing_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_recommendations" ADD CONSTRAINT "marketing_recommendations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_segments_company_id_idx" ON "marketing_segments" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_segments_company_segment_key_idx" ON "marketing_segments" USING btree ("company_id","segment_key");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_company_id_idx" ON "marketing_campaigns" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_company_status_idx" ON "marketing_campaigns" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "marketing_activities_company_id_idx" ON "marketing_activities" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "marketing_activities_campaign_id_idx" ON "marketing_activities" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "marketing_recommendations_company_id_idx" ON "marketing_recommendations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "marketing_recommendations_company_status_idx" ON "marketing_recommendations" USING btree ("company_id","status");
