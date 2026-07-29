CREATE TYPE "public"."personal_comm_account_type" AS ENUM('personal', 'business');--> statement-breakpoint
CREATE TYPE "public"."personal_comm_classification" AS ENUM(
	'business_customer',
	'existing_customer',
	'new_lead',
	'supplier',
	'employee',
	'personal',
	'family',
	'friend',
	'marketing',
	'spam',
	'unknown'
);--> statement-breakpoint
CREATE TYPE "public"."personal_comm_media_type" AS ENUM('voice', 'image', 'video', 'document');--> statement-breakpoint
CREATE TYPE "public"."personal_comm_signal_type" AS ENUM(
	'new_lead',
	'quote_request',
	'emergency_request',
	'payment_confirmation',
	'invoice_request',
	'booking_request',
	'support_request',
	'complaint',
	'compliment'
);--> statement-breakpoint
CREATE TYPE "public"."personal_comm_action_type" AS ENUM('customer_reply', 'business_action');--> statement-breakpoint
CREATE TYPE "public"."personal_comm_action_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TYPE "public"."personal_comm_follow_up_type" AS ENUM(
	'unread_business',
	'awaiting_reply',
	'quote_request',
	'overdue_follow_up',
	'missed_whatsapp_call',
	'missed_voice_call'
);--> statement-breakpoint
CREATE TYPE "public"."personal_comm_analysis_status" AS ENUM('pending', 'completed', 'unavailable', 'failed');--> statement-breakpoint
CREATE TABLE "personal_comm_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"account_type" "personal_comm_account_type" NOT NULL,
	"label" text NOT NULL,
	"phone_number" text,
	"whatsapp_connection_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "personal_comm_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"account_id" uuid,
	"customer_id" uuid,
	"contact_phone" text,
	"contact_name" text,
	"thread_key" text NOT NULL,
	"last_message_at" timestamp with time zone,
	"message_count" integer DEFAULT 0 NOT NULL,
	"classification" "personal_comm_classification" DEFAULT 'unknown' NOT NULL,
	"classification_confidence" integer DEFAULT 0 NOT NULL,
	"manual_classification_override" "personal_comm_classification",
	"privacy_mode" text DEFAULT 'business' NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"excluded_from_reports" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "personal_comm_classification_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"previous_classification" "personal_comm_classification" NOT NULL,
	"corrected_classification" "personal_comm_classification" NOT NULL,
	"notes" text,
	"corrected_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "personal_comm_media_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid,
	"whatsapp_message_id" uuid,
	"media_type" "personal_comm_media_type" NOT NULL,
	"external_media_id" text,
	"mime_type" text,
	"file_name" text,
	"excluded" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);--> statement-breakpoint
CREATE TABLE "personal_comm_voice_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"media_item_id" uuid,
	"whatsapp_message_id" uuid,
	"transcription" text,
	"summary" text,
	"key_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"action_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"customer_intent" text,
	"urgency_score" integer,
	"sentiment" text,
	"language_detected" text,
	"routing_provider_key" text,
	"routing_model_key" text,
	"status" "personal_comm_analysis_status" DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "personal_comm_media_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"issue_summary" text,
	"confidence_score" integer,
	"recommended_service_category" text,
	"detected_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"routing_provider_key" text,
	"routing_model_key" text,
	"status" "personal_comm_analysis_status" DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "personal_comm_document_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"document_type" text,
	"extracted_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"routing_provider_key" text,
	"routing_model_key" text,
	"status" "personal_comm_analysis_status" DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "personal_comm_lead_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid,
	"signal_type" "personal_comm_signal_type" NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"customer_id" uuid,
	"draft_type" text,
	"confidence" integer DEFAULT 50 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "personal_comm_follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid,
	"follow_up_type" "personal_comm_follow_up_type" NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"waiting_since" timestamp with time zone,
	"priority" integer DEFAULT 50 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "personal_comm_privacy_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"business_only_mode" boolean DEFAULT false NOT NULL,
	"personal_only_mode" boolean DEFAULT false NOT NULL,
	"excluded_contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excluded_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excluded_media_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_comm_privacy_settings_company_id_unique" UNIQUE("company_id")
);--> statement-breakpoint
CREATE TABLE "personal_comm_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" "personal_comm_action_type" NOT NULL,
	"status" "personal_comm_action_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"conversation_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "personal_comm_accounts" ADD CONSTRAINT "personal_comm_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_accounts" ADD CONSTRAINT "personal_comm_accounts_whatsapp_connection_id_whatsapp_connections_id_fk" FOREIGN KEY ("whatsapp_connection_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_conversations" ADD CONSTRAINT "personal_comm_conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_conversations" ADD CONSTRAINT "personal_comm_conversations_account_id_personal_comm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."personal_comm_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_conversations" ADD CONSTRAINT "personal_comm_conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_classification_corrections" ADD CONSTRAINT "personal_comm_classification_corrections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_classification_corrections" ADD CONSTRAINT "personal_comm_classification_corrections_conversation_id_personal_comm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."personal_comm_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_classification_corrections" ADD CONSTRAINT "personal_comm_classification_corrections_corrected_by_user_id_users_id_fk" FOREIGN KEY ("corrected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_media_items" ADD CONSTRAINT "personal_comm_media_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_media_items" ADD CONSTRAINT "personal_comm_media_items_conversation_id_personal_comm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."personal_comm_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_media_items" ADD CONSTRAINT "personal_comm_media_items_whatsapp_message_id_whatsapp_messages_id_fk" FOREIGN KEY ("whatsapp_message_id") REFERENCES "public"."whatsapp_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_voice_analyses" ADD CONSTRAINT "personal_comm_voice_analyses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_voice_analyses" ADD CONSTRAINT "personal_comm_voice_analyses_media_item_id_personal_comm_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."personal_comm_media_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_voice_analyses" ADD CONSTRAINT "personal_comm_voice_analyses_whatsapp_message_id_whatsapp_messages_id_fk" FOREIGN KEY ("whatsapp_message_id") REFERENCES "public"."whatsapp_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_media_analyses" ADD CONSTRAINT "personal_comm_media_analyses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_media_analyses" ADD CONSTRAINT "personal_comm_media_analyses_media_item_id_personal_comm_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."personal_comm_media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_document_analyses" ADD CONSTRAINT "personal_comm_document_analyses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_document_analyses" ADD CONSTRAINT "personal_comm_document_analyses_media_item_id_personal_comm_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."personal_comm_media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_lead_signals" ADD CONSTRAINT "personal_comm_lead_signals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_lead_signals" ADD CONSTRAINT "personal_comm_lead_signals_conversation_id_personal_comm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."personal_comm_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_lead_signals" ADD CONSTRAINT "personal_comm_lead_signals_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_follow_ups" ADD CONSTRAINT "personal_comm_follow_ups_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_follow_ups" ADD CONSTRAINT "personal_comm_follow_ups_conversation_id_personal_comm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."personal_comm_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_privacy_settings" ADD CONSTRAINT "personal_comm_privacy_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_privacy_settings" ADD CONSTRAINT "personal_comm_privacy_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_actions" ADD CONSTRAINT "personal_comm_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_actions" ADD CONSTRAINT "personal_comm_actions_conversation_id_personal_comm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."personal_comm_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_comm_actions" ADD CONSTRAINT "personal_comm_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_comm_accounts_company_idx" ON "personal_comm_accounts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "personal_comm_conversations_company_idx" ON "personal_comm_conversations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "personal_comm_media_items_company_idx" ON "personal_comm_media_items" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "personal_comm_lead_signals_company_idx" ON "personal_comm_lead_signals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "personal_comm_follow_ups_company_idx" ON "personal_comm_follow_ups" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "personal_comm_actions_company_idx" ON "personal_comm_actions" USING btree ("company_id");--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'personal_comm_alert';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_business_action';
