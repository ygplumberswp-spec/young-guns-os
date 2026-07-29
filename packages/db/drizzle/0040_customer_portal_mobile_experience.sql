CREATE TYPE "public"."portal_customer_request_type" AS ENUM(
	'quote_clarification',
	'quote_approval',
	'appointment_reschedule',
	'appointment_cancellation',
	'appointment_confirmation',
	'support_message',
	'general_request'
);--> statement-breakpoint
CREATE TYPE "public"."portal_customer_request_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TABLE "portal_customer_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"request_type" "portal_customer_request_type" NOT NULL,
	"status" "portal_customer_request_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "portal_customer_requests" ADD CONSTRAINT "portal_customer_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_customer_requests" ADD CONSTRAINT "portal_customer_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_customer_requests" ADD CONSTRAINT "portal_customer_requests_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD COLUMN "customer_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sop_documents" ADD COLUMN "customer_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'job_update';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'quote_update';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'appointment_update';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'support_update';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_customer_request';--> statement-breakpoint
CREATE INDEX "portal_customer_requests_company_customer_idx" ON "portal_customer_requests" ("company_id", "customer_id");--> statement-breakpoint
CREATE INDEX "portal_customer_requests_status_idx" ON "portal_customer_requests" ("company_id", "status");
