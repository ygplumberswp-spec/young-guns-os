CREATE TYPE "public"."dispatch_emergency_type" AS ENUM(
	'burst_pipe',
	'flooding',
	'blocked_drain',
	'gas_leak',
	'water_leak',
	'no_water',
	'sewer_overflow',
	'other'
);--> statement-breakpoint
CREATE TYPE "public"."dispatch_routing_type" AS ENUM(
	'branch',
	'region',
	'department',
	'emergency',
	'technician',
	'office',
	'service_type'
);--> statement-breakpoint
CREATE TYPE "public"."dispatch_callback_status" AS ENUM(
	'pending_approval',
	'approved',
	'scheduled',
	'completed',
	'cancelled',
	'missed'
);--> statement-breakpoint
CREATE TYPE "public"."dispatch_action_type" AS ENUM('dispatch_action', 'callback_action');--> statement-breakpoint
CREATE TYPE "public"."dispatch_action_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TYPE "public"."dispatch_recommendation_type" AS ENUM(
	'technician_reassignment',
	'overtime_reduction',
	'travel_optimization',
	'workload_balancing',
	'emergency_prioritization',
	'branch_balancing',
	'staffing_shortage',
	'call_routing'
);--> statement-breakpoint
CREATE TABLE "dispatch_receptionist_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"voice_session_id" uuid,
	"customer_id" uuid,
	"service_intent" text,
	"emergency_detected" boolean DEFAULT false NOT NULL,
	"after_hours" boolean DEFAULT false NOT NULL,
	"branch_key" text,
	"language_preference" text,
	"priority_score" integer DEFAULT 0 NOT NULL,
	"summary" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "dispatch_routing_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"voice_session_id" uuid,
	"call_intelligence_id" uuid,
	"routing_type" "dispatch_routing_type" NOT NULL,
	"target_branch" text,
	"target_department" text,
	"priority" integer DEFAULT 100 NOT NULL,
	"recommendation" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "dispatch_callback_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid,
	"voice_session_id" uuid,
	"phone_number" text,
	"status" "dispatch_callback_status" DEFAULT 'pending_approval' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"outcome" text,
	"missed_call_tracked" boolean DEFAULT false NOT NULL,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "dispatch_emergency_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid,
	"voice_session_id" uuid,
	"emergency_type" "dispatch_emergency_type" NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"recommended_response_minutes" integer,
	"escalation_recommendation" text,
	"branch_recommendation" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "dispatch_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"recommendation_type" "dispatch_recommendation_type" NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"technician_id" uuid,
	"job_id" uuid,
	"branch_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "dispatch_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" "dispatch_action_type" NOT NULL,
	"status" "dispatch_action_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"job_id" uuid,
	"technician_id" uuid,
	"callback_request_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "dispatch_receptionist_summaries" ADD CONSTRAINT "dispatch_receptionist_summaries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_receptionist_summaries" ADD CONSTRAINT "dispatch_receptionist_summaries_voice_session_id_voice_sessions_id_fk" FOREIGN KEY ("voice_session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_receptionist_summaries" ADD CONSTRAINT "dispatch_receptionist_summaries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_receptionist_summaries" ADD CONSTRAINT "dispatch_receptionist_summaries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_routing_recommendations" ADD CONSTRAINT "dispatch_routing_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_routing_recommendations" ADD CONSTRAINT "dispatch_routing_recommendations_voice_session_id_voice_sessions_id_fk" FOREIGN KEY ("voice_session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_routing_recommendations" ADD CONSTRAINT "dispatch_routing_recommendations_call_intelligence_id_comm_intel_call_intelligence_id_fk" FOREIGN KEY ("call_intelligence_id") REFERENCES "public"."comm_intel_call_intelligence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_routing_recommendations" ADD CONSTRAINT "dispatch_routing_recommendations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_callback_requests" ADD CONSTRAINT "dispatch_callback_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_callback_requests" ADD CONSTRAINT "dispatch_callback_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_callback_requests" ADD CONSTRAINT "dispatch_callback_requests_voice_session_id_voice_sessions_id_fk" FOREIGN KEY ("voice_session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_callback_requests" ADD CONSTRAINT "dispatch_callback_requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_emergency_assessments" ADD CONSTRAINT "dispatch_emergency_assessments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_emergency_assessments" ADD CONSTRAINT "dispatch_emergency_assessments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_emergency_assessments" ADD CONSTRAINT "dispatch_emergency_assessments_voice_session_id_voice_sessions_id_fk" FOREIGN KEY ("voice_session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_emergency_assessments" ADD CONSTRAINT "dispatch_emergency_assessments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_recommendations" ADD CONSTRAINT "dispatch_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_recommendations" ADD CONSTRAINT "dispatch_recommendations_technician_id_users_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_recommendations" ADD CONSTRAINT "dispatch_recommendations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_actions" ADD CONSTRAINT "dispatch_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_actions" ADD CONSTRAINT "dispatch_actions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_actions" ADD CONSTRAINT "dispatch_actions_technician_id_users_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_actions" ADD CONSTRAINT "dispatch_actions_callback_request_id_dispatch_callback_requests_id_fk" FOREIGN KEY ("callback_request_id") REFERENCES "public"."dispatch_callback_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_actions" ADD CONSTRAINT "dispatch_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dispatch_receptionist_summaries_company_idx" ON "dispatch_receptionist_summaries" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "dispatch_routing_recommendations_company_idx" ON "dispatch_routing_recommendations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "dispatch_callback_requests_company_idx" ON "dispatch_callback_requests" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "dispatch_emergency_assessments_company_idx" ON "dispatch_emergency_assessments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "dispatch_recommendations_company_idx" ON "dispatch_recommendations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "dispatch_actions_company_idx" ON "dispatch_actions" USING btree ("company_id");--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'dispatch_alert';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_dispatch_action';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_callback_action';
