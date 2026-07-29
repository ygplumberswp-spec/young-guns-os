ALTER TYPE "public"."agent_key" ADD VALUE IF NOT EXISTS 'voice_receptionist';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_follow_up_from_call';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_appointment_request_from_call';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_lead_from_call';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_customer_note_from_call';--> statement-breakpoint
CREATE TYPE "public"."voice_session_status" AS ENUM('active', 'completed', 'missed', 'abandoned', 'failed');--> statement-breakpoint
CREATE TYPE "public"."voice_channel" AS ENUM('phone', 'web_voice');--> statement-breakpoint
CREATE TYPE "public"."voice_enquiry_type" AS ENUM('new_enquiry', 'existing_customer', 'service_request', 'quote_request', 'appointment_request', 'other');--> statement-breakpoint
CREATE TYPE "public"."voice_speaker" AS ENUM('caller', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."voice_outcome_type" AS ENUM('qualified', 'appointment_requested', 'quote_requested', 'follow_up_required', 'transferred', 'resolved', 'unresolved', 'other');--> statement-breakpoint
CREATE TYPE "public"."voice_follow_up_type" AS ENUM('customer_note', 'lead_draft', 'sales_follow_up', 'appointment_request', 'communication_draft');--> statement-breakpoint
CREATE TYPE "public"."voice_follow_up_status" AS ENUM('pending', 'accepted', 'dismissed', 'completed');--> statement-breakpoint
CREATE TABLE "voice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid,
	"agent_profile_id" uuid,
	"status" "voice_session_status" DEFAULT 'active' NOT NULL,
	"channel" "voice_channel" DEFAULT 'phone' NOT NULL,
	"enquiry_type" "voice_enquiry_type" DEFAULT 'other' NOT NULL,
	"caller_name" text,
	"caller_phone" text,
	"caller_email" text,
	"duration_seconds" integer,
	"summary" text,
	"follow_up_required" boolean DEFAULT false NOT NULL,
	"qualification" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "voice_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"speaker" "voice_speaker" NOT NULL,
	"content" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "voice_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"outcome_type" "voice_outcome_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "voice_follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"customer_id" uuid,
	"follow_up_type" "voice_follow_up_type" NOT NULL,
	"status" "voice_follow_up_status" DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_agent_profile_id_agent_profiles_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "public"."agent_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_conversations" ADD CONSTRAINT "voice_conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_conversations" ADD CONSTRAINT "voice_conversations_session_id_voice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_outcomes" ADD CONSTRAINT "voice_outcomes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_outcomes" ADD CONSTRAINT "voice_outcomes_session_id_voice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_follow_ups" ADD CONSTRAINT "voice_follow_ups_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_follow_ups" ADD CONSTRAINT "voice_follow_ups_session_id_voice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_follow_ups" ADD CONSTRAINT "voice_follow_ups_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_sessions_company_id_idx" ON "voice_sessions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "voice_sessions_company_status_idx" ON "voice_sessions" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "voice_sessions_customer_id_idx" ON "voice_sessions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "voice_sessions_started_at_idx" ON "voice_sessions" USING btree ("company_id","started_at");--> statement-breakpoint
CREATE INDEX "voice_conversations_session_id_idx" ON "voice_conversations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "voice_conversations_company_id_idx" ON "voice_conversations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "voice_outcomes_session_id_idx" ON "voice_outcomes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "voice_outcomes_company_id_idx" ON "voice_outcomes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "voice_follow_ups_company_id_idx" ON "voice_follow_ups" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "voice_follow_ups_company_status_idx" ON "voice_follow_ups" USING btree ("company_id","status");
