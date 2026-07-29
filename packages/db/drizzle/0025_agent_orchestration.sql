ALTER TYPE "public"."automation_queue_job_type" ADD VALUE IF NOT EXISTS 'execute_orchestration_event';--> statement-breakpoint
ALTER TYPE "public"."automation_queue_job_type" ADD VALUE IF NOT EXISTS 'execute_orchestration_run';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE IF NOT EXISTS 'stock_threshold_reached';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE IF NOT EXISTS 'communication_received';--> statement-breakpoint
CREATE TYPE "public"."orchestration_status" AS ENUM('draft', 'active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."orchestration_run_status" AS ENUM('pending', 'running', 'completed', 'failed', 'awaiting_approval', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."orchestration_step_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval');--> statement-breakpoint
CREATE TYPE "public"."orchestration_step_mode" AS ENUM('sequential', 'parallel');--> statement-breakpoint
CREATE TYPE "public"."orchestration_approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."orchestration_log_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TABLE "agent_orchestrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "orchestration_status" DEFAULT 'draft' NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "agent_orchestration_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"orchestration_id" uuid NOT NULL,
	"agent_key" "agent_key" NOT NULL,
	"step_key" text NOT NULL,
	"name" text NOT NULL,
	"execution_mode" "orchestration_step_mode" DEFAULT 'sequential' NOT NULL,
	"parallel_group_key" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"request_template" text NOT NULL,
	"capability_request" text,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"handoff_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "agent_orchestration_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"orchestration_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"condition_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "agent_orchestration_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"orchestration_id" uuid,
	"trigger_event" text,
	"trigger_entity_type" text,
	"trigger_entity_id" uuid,
	"status" "orchestration_run_status" DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"initiated_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "agent_orchestration_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"definition_step_id" uuid,
	"agent_key" "agent_key" NOT NULL,
	"agent_run_id" uuid,
	"step_key" text NOT NULL,
	"execution_mode" "orchestration_step_mode" DEFAULT 'sequential' NOT NULL,
	"parallel_group_key" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"handoff_from_step_id" uuid,
	"status" "orchestration_step_status" DEFAULT 'pending' NOT NULL,
	"context_in" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"context_out" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "agent_orchestration_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"run_step_id" uuid NOT NULL,
	"status" "orchestration_approval_status" DEFAULT 'pending' NOT NULL,
	"preview" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_by_user_id" uuid,
	"decided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "agent_orchestration_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"run_step_id" uuid,
	"log_level" "orchestration_log_level" DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "agent_orchestrations" ADD CONSTRAINT "agent_orchestrations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestrations" ADD CONSTRAINT "agent_orchestrations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_steps" ADD CONSTRAINT "agent_orchestration_steps_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_steps" ADD CONSTRAINT "agent_orchestration_steps_orchestration_id_agent_orchestrations_id_fk" FOREIGN KEY ("orchestration_id") REFERENCES "public"."agent_orchestrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_triggers" ADD CONSTRAINT "agent_orchestration_triggers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_triggers" ADD CONSTRAINT "agent_orchestration_triggers_orchestration_id_agent_orchestrations_id_fk" FOREIGN KEY ("orchestration_id") REFERENCES "public"."agent_orchestrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_runs" ADD CONSTRAINT "agent_orchestration_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_runs" ADD CONSTRAINT "agent_orchestration_runs_orchestration_id_agent_orchestrations_id_fk" FOREIGN KEY ("orchestration_id") REFERENCES "public"."agent_orchestrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_runs" ADD CONSTRAINT "agent_orchestration_runs_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_run_steps" ADD CONSTRAINT "agent_orchestration_run_steps_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_run_steps" ADD CONSTRAINT "agent_orchestration_run_steps_run_id_agent_orchestration_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_orchestration_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_run_steps" ADD CONSTRAINT "agent_orchestration_run_steps_definition_step_id_agent_orchestration_steps_id_fk" FOREIGN KEY ("definition_step_id") REFERENCES "public"."agent_orchestration_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_run_steps" ADD CONSTRAINT "agent_orchestration_run_steps_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_run_steps" ADD CONSTRAINT "agent_orchestration_run_steps_handoff_from_step_id_agent_orchestration_run_steps_id_fk" FOREIGN KEY ("handoff_from_step_id") REFERENCES "public"."agent_orchestration_run_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_approvals" ADD CONSTRAINT "agent_orchestration_approvals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_approvals" ADD CONSTRAINT "agent_orchestration_approvals_run_id_agent_orchestration_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_orchestration_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_approvals" ADD CONSTRAINT "agent_orchestration_approvals_run_step_id_agent_orchestration_run_steps_id_fk" FOREIGN KEY ("run_step_id") REFERENCES "public"."agent_orchestration_run_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_approvals" ADD CONSTRAINT "agent_orchestration_approvals_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_approvals" ADD CONSTRAINT "agent_orchestration_approvals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_logs" ADD CONSTRAINT "agent_orchestration_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_logs" ADD CONSTRAINT "agent_orchestration_logs_run_id_agent_orchestration_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_orchestration_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orchestration_logs" ADD CONSTRAINT "agent_orchestration_logs_run_step_id_agent_orchestration_run_steps_id_fk" FOREIGN KEY ("run_step_id") REFERENCES "public"."agent_orchestration_run_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_orchestrations_company_id_idx" ON "agent_orchestrations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agent_orchestration_triggers_company_event_idx" ON "agent_orchestration_triggers" USING btree ("company_id", "event_type", "enabled");--> statement-breakpoint
CREATE INDEX "agent_orchestration_runs_company_status_idx" ON "agent_orchestration_runs" USING btree ("company_id", "status");--> statement-breakpoint
CREATE INDEX "agent_orchestration_approvals_company_status_idx" ON "agent_orchestration_approvals" USING btree ("company_id", "status");--> statement-breakpoint
CREATE INDEX "agent_orchestration_logs_run_id_idx" ON "agent_orchestration_logs" USING btree ("run_id", "created_at");
