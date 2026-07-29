ALTER TYPE "public"."agent_key" ADD VALUE IF NOT EXISTS 'evolution';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_evolution_report';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_optimization_plan';--> statement-breakpoint
CREATE TYPE "public"."evolution_learning_source_type" AS ENUM(
	'user_approval',
	'user_correction',
	'completed_job',
	'customer_feedback',
	'technician_performance',
	'financial_outcome',
	'workflow_history',
	'ai_interaction',
	'business_decision'
);--> statement-breakpoint
CREATE TYPE "public"."evolution_learning_status" AS ENUM('pending_approval', 'approved', 'rejected', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."evolution_pattern_type" AS ENUM(
	'operational_trend',
	'customer_behaviour',
	'technician_strength',
	'inventory_demand',
	'fleet_utilization',
	'seasonal_change',
	'financial_anomaly',
	'business_risk'
);--> statement-breakpoint
CREATE TYPE "public"."evolution_recommendation_category" AS ENUM(
	'scheduling',
	'dispatch',
	'fleet',
	'inventory',
	'procurement',
	'pricing',
	'marketing',
	'finance',
	'workforce',
	'customer_success',
	'ai_prompts',
	'automation'
);--> statement-breakpoint
CREATE TYPE "public"."evolution_recommendation_status" AS ENUM('pending', 'accepted', 'dismissed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."evolution_optimization_status" AS ENUM(
	'suggested',
	'pending_approval',
	'approved',
	'rejected',
	'deployed',
	'rolled_back'
);--> statement-breakpoint
CREATE TYPE "public"."evolution_timeline_event_type" AS ENUM(
	'system_improvement',
	'ai_learning',
	'workflow_improvement',
	'kpi_improvement',
	'business_growth',
	'optimization_history'
);--> statement-breakpoint
CREATE TABLE "evolution_learning_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_type" "evolution_learning_source_type" NOT NULL,
	"status" "evolution_learning_status" DEFAULT 'pending_approval' NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"confidence_score" double precision,
	"source_module" text,
	"source_entity_type" text,
	"source_entity_id" uuid,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"rolled_back_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "evolution_learning_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"learning_event_id" uuid,
	"action_type" text NOT NULL,
	"description" text NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"performed_by_user_id" uuid,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "evolution_model_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"version_label" text NOT NULL,
	"description" text,
	"confidence_score" double precision,
	"learning_event_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "evolution_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"pattern_type" "evolution_pattern_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"confidence_score" double precision,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "evolution_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category" "evolution_recommendation_category" NOT NULL,
	"title" text NOT NULL,
	"recommendation" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" "evolution_recommendation_status" DEFAULT 'pending' NOT NULL,
	"confidence_score" double precision,
	"estimated_impact" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "evolution_optimization_studio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "evolution_optimization_status" DEFAULT 'suggested' NOT NULL,
	"estimated_impact" text,
	"risk_assessment" text,
	"cost_analysis" text,
	"confidence_score" double precision,
	"recommendation_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"deployed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "evolution_timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"event_type" "evolution_timeline_event_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source_module" text,
	"entity_id" uuid,
	"impact_summary" text,
	"event_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "evolution_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"optimization_score" integer,
	"learning_progress_percent" double precision,
	"ai_confidence_score" double precision,
	"recommendation_acceptance_rate" double precision,
	"learning_event_count" integer DEFAULT 0 NOT NULL,
	"pattern_count" integer DEFAULT 0 NOT NULL,
	"pending_recommendation_count" integer DEFAULT 0 NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "evolution_safe_learning_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_type" "evolution_learning_source_type" NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"allow_rollback" boolean DEFAULT true NOT NULL,
	"min_confidence_score" double precision,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "evolution_learning_events" ADD CONSTRAINT "evolution_learning_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_learning_events" ADD CONSTRAINT "evolution_learning_events_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_learning_audit" ADD CONSTRAINT "evolution_learning_audit_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_learning_audit" ADD CONSTRAINT "evolution_learning_audit_learning_event_id_evolution_learning_events_id_fk" FOREIGN KEY ("learning_event_id") REFERENCES "public"."evolution_learning_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_learning_audit" ADD CONSTRAINT "evolution_learning_audit_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_model_versions" ADD CONSTRAINT "evolution_model_versions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_patterns" ADD CONSTRAINT "evolution_patterns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_recommendations" ADD CONSTRAINT "evolution_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_optimization_studio" ADD CONSTRAINT "evolution_optimization_studio_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_optimization_studio" ADD CONSTRAINT "evolution_optimization_studio_recommendation_id_evolution_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."evolution_recommendations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_optimization_studio" ADD CONSTRAINT "evolution_optimization_studio_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_optimization_studio" ADD CONSTRAINT "evolution_optimization_studio_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_timeline_events" ADD CONSTRAINT "evolution_timeline_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_snapshots" ADD CONSTRAINT "evolution_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_safe_learning_policies" ADD CONSTRAINT "evolution_safe_learning_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_safe_learning_policies" ADD CONSTRAINT "evolution_safe_learning_policies_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evolution_learning_events_company_status_idx" ON "evolution_learning_events" ("company_id","status","source_type");--> statement-breakpoint
CREATE INDEX "evolution_patterns_company_detected_idx" ON "evolution_patterns" ("company_id","detected_at");--> statement-breakpoint
CREATE INDEX "evolution_recommendations_company_category_idx" ON "evolution_recommendations" ("company_id","category","status");--> statement-breakpoint
CREATE INDEX "evolution_timeline_events_company_event_at_idx" ON "evolution_timeline_events" ("company_id","event_at");--> statement-breakpoint
CREATE UNIQUE INDEX "evolution_safe_learning_policies_company_source_idx" ON "evolution_safe_learning_policies" ("company_id","source_type");
