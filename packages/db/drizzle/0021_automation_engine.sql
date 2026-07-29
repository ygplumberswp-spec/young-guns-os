CREATE TYPE "public"."workflow_run_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval');--> statement-breakpoint
CREATE TYPE "public"."workflow_step_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval');--> statement-breakpoint
CREATE TYPE "public"."workflow_step_result_status" AS ENUM('pending', 'completed', 'failed', 'awaiting_approval', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."workflow_condition_operator" AS ENUM('equals', 'not_equals', 'exists', 'not_exists');--> statement-breakpoint
CREATE TYPE "public"."automation_queue_job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'retry');--> statement-breakpoint
CREATE TYPE "public"."automation_queue_job_type" AS ENUM('execute_event', 'scheduled_workflow', 'retry_step');--> statement-breakpoint
CREATE TABLE "workflow_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"field" text NOT NULL,
	"operator" "workflow_condition_operator" DEFAULT 'equals' NOT NULL,
	"value" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_id" uuid,
	"workflow_execution_id" uuid,
	"trigger_event" text NOT NULL,
	"trigger_entity_type" text,
	"trigger_entity_id" uuid,
	"status" "workflow_run_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "workflow_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"workflow_action_id" uuid,
	"action_type" "workflow_action_type" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "workflow_step_status" DEFAULT 'pending' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "workflow_step_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_step_id" uuid NOT NULL,
	"status" "workflow_step_result_status" DEFAULT 'pending' NOT NULL,
	"output" jsonb,
	"error_message" text,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"preview" text,
	"approved_by_user_id" uuid,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "automation_queue_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"job_type" "automation_queue_job_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "automation_queue_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "workflow_conditions" ADD CONSTRAINT "workflow_conditions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_conditions" ADD CONSTRAINT "workflow_conditions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_execution_id_workflow_executions_id_fk" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_action_id_workflow_actions_id_fk" FOREIGN KEY ("workflow_action_id") REFERENCES "public"."workflow_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_results" ADD CONSTRAINT "workflow_step_results_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_results" ADD CONSTRAINT "workflow_step_results_workflow_step_id_workflow_steps_id_fk" FOREIGN KEY ("workflow_step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_results" ADD CONSTRAINT "workflow_step_results_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_queue_jobs" ADD CONSTRAINT "automation_queue_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_conditions_workflow_id_idx" ON "workflow_conditions" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_company_id_idx" ON "workflow_runs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_id_idx" ON "workflow_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_steps_workflow_run_id_idx" ON "workflow_steps" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "workflow_step_results_workflow_step_id_idx" ON "workflow_step_results" USING btree ("workflow_step_id");--> statement-breakpoint
CREATE INDEX "automation_queue_jobs_status_scheduled_idx" ON "automation_queue_jobs" USING btree ("status", "scheduled_for");--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE 'customer_updated';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE 'job_scheduled';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE 'job_completed';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE 'quote_created';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE 'vehicle_status_changed';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE 'gps_event';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE 'whatsapp_message_received';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE 'update_customer';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE 'assign_job_task';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE 'send_email_draft';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE 'create_payment_reminder';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE 'ask_aura_agent';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE 'generate_summary';
