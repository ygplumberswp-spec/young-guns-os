ALTER TYPE "public"."agent_key" ADD VALUE IF NOT EXISTS 'customer_support';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_customer_response';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_appointment_update';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_invoice_explanation';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_service_information_response';--> statement-breakpoint
CREATE TYPE "public"."customer_support_conversation_status" AS ENUM('open', 'in_progress', 'waiting_customer', 'escalated', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."customer_support_channel" AS ENUM('portal', 'email', 'phone', 'chat', 'other');--> statement-breakpoint
CREATE TYPE "public"."customer_support_message_role" AS ENUM('customer', 'agent', 'system', 'ai_draft');--> statement-breakpoint
CREATE TYPE "public"."customer_support_escalation_status" AS ENUM('pending', 'assigned', 'in_progress', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."customer_support_escalation_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."customer_support_sentiment" AS ENUM('positive', 'neutral', 'negative');--> statement-breakpoint
CREATE TABLE "customer_support_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"portal_user_id" uuid,
	"assigned_user_id" uuid,
	"channel" "customer_support_channel" DEFAULT 'portal' NOT NULL,
	"status" "customer_support_conversation_status" DEFAULT 'open' NOT NULL,
	"subject" text NOT NULL,
	"outcome" text,
	"resolution_status" text DEFAULT 'unresolved' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "customer_support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "customer_support_message_role" NOT NULL,
	"content" text NOT NULL,
	"author_user_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "customer_support_escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"priority" "customer_support_escalation_priority" DEFAULT 'medium' NOT NULL,
	"status" "customer_support_escalation_status" DEFAULT 'pending' NOT NULL,
	"assigned_user_id" uuid,
	"resolution" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "customer_support_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"sentiment" "customer_support_sentiment" DEFAULT 'neutral' NOT NULL,
	"rating" integer,
	"comment" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "customer_support_conversations" ADD CONSTRAINT "customer_support_conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_support_conversations" ADD CONSTRAINT "customer_support_conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_support_conversations" ADD CONSTRAINT "customer_support_conversations_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_support_conversations" ADD CONSTRAINT "customer_support_conversations_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_support_conversations" ADD CONSTRAINT "customer_support_conversations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_support_messages" ADD CONSTRAINT "customer_support_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_support_messages" ADD CONSTRAINT "customer_support_messages_conversation_id_customer_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."customer_support_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_support_messages" ADD CONSTRAINT "customer_support_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_support_escalations" ADD CONSTRAINT "customer_support_escalations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_support_escalations" ADD CONSTRAINT "customer_support_escalations_conversation_id_customer_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."customer_support_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_support_escalations" ADD CONSTRAINT "customer_support_escalations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_support_escalations" ADD CONSTRAINT "customer_support_escalations_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_support_feedback" ADD CONSTRAINT "customer_support_feedback_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_support_feedback" ADD CONSTRAINT "customer_support_feedback_conversation_id_customer_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."customer_support_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_support_feedback" ADD CONSTRAINT "customer_support_feedback_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_support_conversations_company_id_idx" ON "customer_support_conversations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "customer_support_conversations_company_status_idx" ON "customer_support_conversations" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "customer_support_conversations_customer_id_idx" ON "customer_support_conversations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_support_messages_conversation_id_idx" ON "customer_support_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "customer_support_messages_company_id_idx" ON "customer_support_messages" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "customer_support_escalations_company_id_idx" ON "customer_support_escalations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "customer_support_escalations_company_status_idx" ON "customer_support_escalations" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "customer_support_feedback_company_id_idx" ON "customer_support_feedback" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "customer_support_feedback_conversation_id_idx" ON "customer_support_feedback" USING btree ("conversation_id");
