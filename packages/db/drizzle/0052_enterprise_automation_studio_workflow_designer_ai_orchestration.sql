ALTER TYPE "public"."agent_key" ADD VALUE IF NOT EXISTS 'automation';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_workflow_improvement';--> statement-breakpoint
CREATE TYPE "public"."automation_studio_node_type" AS ENUM(
	'trigger',
	'action',
	'condition',
	'delay',
	'approval',
	'parallel',
	'loop',
	'webhook',
	'ai_agent',
	'custom'
);--> statement-breakpoint
CREATE TYPE "public"."automation_approval_type" AS ENUM(
	'single',
	'multi_level',
	'department',
	'executive',
	'delegated'
);--> statement-breakpoint
CREATE TYPE "public"."automation_approval_status" AS ENUM(
	'pending',
	'approved',
	'rejected',
	'delegated',
	'cancelled'
);--> statement-breakpoint
CREATE TYPE "public"."automation_studio_action_type" AS ENUM(
	'workflow_improvement',
	'automation_recommendation',
	'bottleneck_fix',
	'performance_optimization'
);--> statement-breakpoint
CREATE TYPE "public"."automation_studio_action_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TYPE "public"."automation_recommendation_status" AS ENUM('pending', 'accepted', 'dismissed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."automation_test_run_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "automation_studio_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"change_summary" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "automation_studio_variables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"variable_key" text NOT NULL,
	"label" text NOT NULL,
	"variable_type" text DEFAULT 'string' NOT NULL,
	"default_value" text,
	"required" boolean DEFAULT false NOT NULL,
	"validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "automation_studio_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"node_key" text NOT NULL,
	"node_type" "automation_studio_node_type" NOT NULL,
	"title" text NOT NULL,
	"position_x" integer DEFAULT 0 NOT NULL,
	"position_y" integer DEFAULT 0 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "automation_studio_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"source_node_key" text NOT NULL,
	"target_node_key" text NOT NULL,
	"condition_expression" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "automation_studio_approval_chains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"approval_type" "automation_approval_type" DEFAULT 'single' NOT NULL,
	"levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "automation_studio_approval_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_run_id" uuid,
	"approval_type" "automation_approval_type" NOT NULL,
	"status" "automation_approval_status" DEFAULT 'pending' NOT NULL,
	"approver_user_id" uuid,
	"delegated_to_user_id" uuid,
	"comment" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "automation_studio_test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"status" "automation_test_run_status" DEFAULT 'pending' NOT NULL,
	"input_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_summary" text,
	"simulation_run_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "automation_studio_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_id" uuid,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"avg_duration_ms" integer,
	"queue_depth" integer DEFAULT 0 NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "automation_studio_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_id" uuid,
	"title" text NOT NULL,
	"recommendation" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" "automation_recommendation_status" DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "automation_studio_platform_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" "automation_studio_action_type" NOT NULL,
	"status" "automation_studio_action_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"workflow_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "automation_studio_versions" ADD CONSTRAINT "automation_studio_versions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_versions" ADD CONSTRAINT "automation_studio_versions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_versions" ADD CONSTRAINT "automation_studio_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_variables" ADD CONSTRAINT "automation_studio_variables_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_variables" ADD CONSTRAINT "automation_studio_variables_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_nodes" ADD CONSTRAINT "automation_studio_nodes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_nodes" ADD CONSTRAINT "automation_studio_nodes_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_connections" ADD CONSTRAINT "automation_studio_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_connections" ADD CONSTRAINT "automation_studio_connections_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_approval_chains" ADD CONSTRAINT "automation_studio_approval_chains_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_approval_chains" ADD CONSTRAINT "automation_studio_approval_chains_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_approval_records" ADD CONSTRAINT "automation_studio_approval_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_approval_records" ADD CONSTRAINT "automation_studio_approval_records_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_approval_records" ADD CONSTRAINT "automation_studio_approval_records_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_approval_records" ADD CONSTRAINT "automation_studio_approval_records_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_approval_records" ADD CONSTRAINT "automation_studio_approval_records_delegated_to_user_id_users_id_fk" FOREIGN KEY ("delegated_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_test_runs" ADD CONSTRAINT "automation_studio_test_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_test_runs" ADD CONSTRAINT "automation_studio_test_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_test_runs" ADD CONSTRAINT "automation_studio_test_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_metrics" ADD CONSTRAINT "automation_studio_metrics_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_metrics" ADD CONSTRAINT "automation_studio_metrics_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_recommendations" ADD CONSTRAINT "automation_studio_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_recommendations" ADD CONSTRAINT "automation_studio_recommendations_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_platform_actions" ADD CONSTRAINT "automation_studio_platform_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_platform_actions" ADD CONSTRAINT "automation_studio_platform_actions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_studio_platform_actions" ADD CONSTRAINT "automation_studio_platform_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_studio_versions_workflow_version_idx" ON "automation_studio_versions" ("workflow_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_studio_variables_workflow_key_idx" ON "automation_studio_variables" ("workflow_id","variable_key");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_studio_nodes_workflow_key_idx" ON "automation_studio_nodes" ("workflow_id","node_key");--> statement-breakpoint
CREATE INDEX "automation_studio_metrics_company_recorded_idx" ON "automation_studio_metrics" ("company_id","recorded_at");
