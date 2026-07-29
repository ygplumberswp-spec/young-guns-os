ALTER TYPE "public"."workflow_status" ADD VALUE IF NOT EXISTS 'pending_approval';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE IF NOT EXISTS 'quote_accepted';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE IF NOT EXISTS 'lead_created';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE IF NOT EXISTS 'lead_converted';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE IF NOT EXISTS 'purchase_order_approved';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE IF NOT EXISTS 'voice_call_completed';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE IF NOT EXISTS 'support_escalated';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE IF NOT EXISTS 'marketing_campaign_completed';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE IF NOT EXISTS 'scheduled_time';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE IF NOT EXISTS 'webhook';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE IF NOT EXISTS 'create_task';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE IF NOT EXISTS 'assign_user';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE IF NOT EXISTS 'notify_user';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE IF NOT EXISTS 'send_internal_notification';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE IF NOT EXISTS 'create_draft_sms';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE IF NOT EXISTS 'create_draft_customer_response';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE IF NOT EXISTS 'generate_recommendation';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE IF NOT EXISTS 'create_purchase_order_draft';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE IF NOT EXISTS 'generate_report';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE IF NOT EXISTS 'create_follow_up';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE IF NOT EXISTS 'run_ai_agent';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE IF NOT EXISTS 'update_record';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE IF NOT EXISTS 'create_approval_request';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE IF NOT EXISTS 'execute_approved_step';--> statement-breakpoint
ALTER TYPE "public"."workflow_condition_operator" ADD VALUE IF NOT EXISTS 'contains';--> statement-breakpoint
ALTER TYPE "public"."workflow_condition_operator" ADD VALUE IF NOT EXISTS 'greater_than';--> statement-breakpoint
ALTER TYPE "public"."workflow_condition_operator" ADD VALUE IF NOT EXISTS 'less_than';--> statement-breakpoint
CREATE TYPE "public"."workflow_schedule_type" AS ENUM('cron', 'daily', 'weekly', 'monthly', 'interval', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."workflow_template_category" AS ENUM('customer_follow_up', 'invoice_reminder', 'lead_qualification', 'job_completion', 'technician_notification', 'purchase_approval', 'marketing_review', 'executive_reporting', 'custom');--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "updated_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "canvas_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "approved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "is_simulation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "initiated_by_user_id" uuid;--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" "workflow_template_category" DEFAULT 'custom' NOT NULL,
	"template_key" text NOT NULL,
	"definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "workflow_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"schedule_type" "workflow_schedule_type" NOT NULL,
	"cron_expression" text,
	"interval_minutes" integer,
	"run_at" timestamp with time zone,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "workflow_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"webhook_key" text NOT NULL,
	"secret_hash" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "workflow_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_id" uuid,
	"workflow_run_id" uuid,
	"event_type" text NOT NULL,
	"node_key" text,
	"message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedules" ADD CONSTRAINT "workflow_schedules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedules" ADD CONSTRAINT "workflow_schedules_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedules" ADD CONSTRAINT "workflow_schedules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_webhooks" ADD CONSTRAINT "workflow_webhooks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_webhooks" ADD CONSTRAINT "workflow_webhooks_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_audit_logs" ADD CONSTRAINT "workflow_audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_audit_logs" ADD CONSTRAINT "workflow_audit_logs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_audit_logs" ADD CONSTRAINT "workflow_audit_logs_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_audit_logs" ADD CONSTRAINT "workflow_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_workflow';--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_webhooks_company_webhook_key_idx" ON "workflow_webhooks" ("company_id", "webhook_key");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_templates_company_template_key_idx" ON "workflow_templates" ("company_id", "template_key");
