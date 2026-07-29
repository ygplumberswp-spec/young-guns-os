CREATE TYPE "public"."comm_intel_channel" AS ENUM(
	'phone',
	'whatsapp',
	'email',
	'sms',
	'portal',
	'support',
	'internal'
);--> statement-breakpoint
CREATE TYPE "public"."comm_intel_call_type" AS ENUM(
	'inbound',
	'outbound',
	'missed',
	'transferred',
	'voicemail',
	'callback'
);--> statement-breakpoint
CREATE TYPE "public"."comm_intel_call_outcome" AS ENUM(
	'answered',
	'missed',
	'voicemail',
	'transferred',
	'resolved',
	'unresolved',
	'callback_requested'
);--> statement-breakpoint
CREATE TYPE "public"."comm_intel_sentiment" AS ENUM(
	'positive',
	'neutral',
	'negative',
	'mixed'
);--> statement-breakpoint
CREATE TYPE "public"."comm_intel_recording_status" AS ENUM(
	'pending',
	'available',
	'archived',
	'deleted'
);--> statement-breakpoint
CREATE TYPE "public"."comm_intel_transcription_status" AS ENUM(
	'pending',
	'processing',
	'completed',
	'failed',
	'unavailable'
);--> statement-breakpoint
CREATE TYPE "public"."comm_intel_consent_status" AS ENUM(
	'granted',
	'denied',
	'unknown',
	'revoked'
);--> statement-breakpoint
CREATE TYPE "public"."comm_intel_source_type" AS ENUM(
	'voice_session',
	'whatsapp_message',
	'communication',
	'support_conversation',
	'portal_request'
);--> statement-breakpoint
CREATE TYPE "public"."comm_intel_sms_status" AS ENUM(
	'sent',
	'delivered',
	'failed',
	'replied'
);--> statement-breakpoint
CREATE TYPE "public"."comm_intel_draft_type" AS ENUM(
	'customer_reply',
	'follow_up'
);--> statement-breakpoint
CREATE TYPE "public"."comm_intel_draft_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TABLE "comm_intel_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"voice_session_id" uuid,
	"storage_reference" text,
	"retention_policy_days" integer,
	"consent_status" "comm_intel_consent_status" DEFAULT 'unknown' NOT NULL,
	"recording_status" "comm_intel_recording_status" DEFAULT 'pending' NOT NULL,
	"transcription_status" "comm_intel_transcription_status" DEFAULT 'unavailable' NOT NULL,
	"transcript_reference" text,
	"ai_summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "comm_intel_call_intelligence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"voice_session_id" uuid NOT NULL,
	"customer_id" uuid,
	"call_type" "comm_intel_call_type" NOT NULL,
	"queue_name" text,
	"assigned_staff_id" uuid,
	"outcome" "comm_intel_call_outcome",
	"sentiment" "comm_intel_sentiment",
	"intent" text,
	"follow_up_status" text DEFAULT 'none' NOT NULL,
	"recording_id" uuid,
	"duration_seconds" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "comm_intel_conversation_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_type" "comm_intel_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"customer_id" uuid,
	"channel" "comm_intel_channel" NOT NULL,
	"sentiment" "comm_intel_sentiment" DEFAULT 'neutral' NOT NULL,
	"urgency_score" integer DEFAULT 0 NOT NULL,
	"has_complaint" boolean DEFAULT false NOT NULL,
	"has_compliment" boolean DEFAULT false NOT NULL,
	"buying_intent" boolean DEFAULT false NOT NULL,
	"cancellation_risk" boolean DEFAULT false NOT NULL,
	"escalation_risk" boolean DEFAULT false NOT NULL,
	"follow_up_recommendation" text,
	"ai_summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "comm_intel_email_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"thread_key" text NOT NULL,
	"communication_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentiment" "comm_intel_sentiment" DEFAULT 'neutral' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"ai_summary" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "comm_intel_sms_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid,
	"communication_id" uuid,
	"template_id" uuid,
	"campaign_key" text,
	"direction" text NOT NULL,
	"status" "comm_intel_sms_status" DEFAULT 'sent' NOT NULL,
	"body_preview" text NOT NULL,
	"reply_to_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "comm_intel_draft_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"draft_type" "comm_intel_draft_type" NOT NULL,
	"status" "comm_intel_draft_status" DEFAULT 'pending_approval' NOT NULL,
	"channel" "comm_intel_channel" NOT NULL,
	"customer_id" uuid,
	"subject" text,
	"body" text NOT NULL,
	"source_type" "comm_intel_source_type",
	"source_id" uuid,
	"job_id" uuid,
	"quote_id" uuid,
	"invoice_id" uuid,
	"support_conversation_id" uuid,
	"lead_id" uuid,
	"technician_id" uuid,
	"staff_user_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "comm_intel_recordings" ADD CONSTRAINT "comm_intel_recordings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_recordings" ADD CONSTRAINT "comm_intel_recordings_voice_session_id_voice_sessions_id_fk" FOREIGN KEY ("voice_session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_call_intelligence" ADD CONSTRAINT "comm_intel_call_intelligence_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_call_intelligence" ADD CONSTRAINT "comm_intel_call_intelligence_voice_session_id_voice_sessions_id_fk" FOREIGN KEY ("voice_session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_call_intelligence" ADD CONSTRAINT "comm_intel_call_intelligence_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_call_intelligence" ADD CONSTRAINT "comm_intel_call_intelligence_assigned_staff_id_users_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_call_intelligence" ADD CONSTRAINT "comm_intel_call_intelligence_recording_id_comm_intel_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."comm_intel_recordings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_conversation_insights" ADD CONSTRAINT "comm_intel_conversation_insights_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_conversation_insights" ADD CONSTRAINT "comm_intel_conversation_insights_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_email_threads" ADD CONSTRAINT "comm_intel_email_threads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_email_threads" ADD CONSTRAINT "comm_intel_email_threads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_sms_records" ADD CONSTRAINT "comm_intel_sms_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_sms_records" ADD CONSTRAINT "comm_intel_sms_records_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_sms_records" ADD CONSTRAINT "comm_intel_sms_records_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_sms_records" ADD CONSTRAINT "comm_intel_sms_records_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_draft_actions" ADD CONSTRAINT "comm_intel_draft_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_draft_actions" ADD CONSTRAINT "comm_intel_draft_actions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_draft_actions" ADD CONSTRAINT "comm_intel_draft_actions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_draft_actions" ADD CONSTRAINT "comm_intel_draft_actions_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_draft_actions" ADD CONSTRAINT "comm_intel_draft_actions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_draft_actions" ADD CONSTRAINT "comm_intel_draft_actions_support_conversation_id_customer_support_conversations_id_fk" FOREIGN KEY ("support_conversation_id") REFERENCES "public"."customer_support_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_draft_actions" ADD CONSTRAINT "comm_intel_draft_actions_technician_id_users_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_draft_actions" ADD CONSTRAINT "comm_intel_draft_actions_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_intel_draft_actions" ADD CONSTRAINT "comm_intel_draft_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comm_intel_recordings_company_idx" ON "comm_intel_recordings" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "comm_intel_call_intelligence_company_idx" ON "comm_intel_call_intelligence" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "comm_intel_call_intelligence_voice_session_idx" ON "comm_intel_call_intelligence" USING btree ("voice_session_id");--> statement-breakpoint
CREATE INDEX "comm_intel_conversation_insights_company_idx" ON "comm_intel_conversation_insights" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "comm_intel_conversation_insights_source_idx" ON "comm_intel_conversation_insights" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "comm_intel_email_threads_company_idx" ON "comm_intel_email_threads" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "comm_intel_sms_records_company_idx" ON "comm_intel_sms_records" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "comm_intel_draft_actions_company_idx" ON "comm_intel_draft_actions" USING btree ("company_id");--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'comm_intel_alert';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'missed_call_alert';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_customer_reply';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_follow_up';
