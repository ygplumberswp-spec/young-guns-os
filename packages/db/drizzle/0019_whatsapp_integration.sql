CREATE TYPE "public"."whatsapp_provider" AS ENUM('meta_cloud_api');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_connection_status" AS ENUM('disconnected', 'pending', 'connected', 'error');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_message_direction" AS ENUM('incoming', 'outgoing');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_delivery_status" AS ENUM('draft', 'pending', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_template_category" AS ENUM('job_booked_confirmation', 'technician_assigned', 'technician_on_the_way', 'job_completed', 'invoice_sent', 'payment_reminder', 'utility', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_template_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "whatsapp_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" "whatsapp_provider" DEFAULT 'meta_cloud_api' NOT NULL,
	"phone_number_id" text,
	"business_account_id" text,
	"display_phone_number" text,
	"credentials_encrypted" text,
	"webhook_verify_token" text,
	"status" "whatsapp_connection_status" DEFAULT 'disconnected' NOT NULL,
	"last_error" text,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_connections_company_id_unique" UNIQUE("company_id")
);--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"external_template_id" text,
	"category" "whatsapp_template_category" DEFAULT 'utility' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"body" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "whatsapp_template_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid,
	"direction" "whatsapp_message_direction" NOT NULL,
	"message_content" text NOT NULL,
	"external_message_id" text,
	"delivery_status" "whatsapp_delivery_status" DEFAULT 'pending' NOT NULL,
	"template_id" uuid,
	"notification_category" "whatsapp_template_category",
	"is_draft" boolean DEFAULT false NOT NULL,
	"approved_by_user_id" uuid,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_template_id_whatsapp_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_messages_company_id_idx" ON "whatsapp_messages" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_customer_id_idx" ON "whatsapp_messages" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_external_message_id_idx" ON "whatsapp_messages" USING btree ("external_message_id");--> statement-breakpoint
CREATE INDEX "whatsapp_connections_phone_number_id_idx" ON "whatsapp_connections" USING btree ("phone_number_id");--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE 'whatsapp';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger_type" ADD VALUE 'invoice_overdue';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE 'send_whatsapp_template';--> statement-breakpoint
ALTER TYPE "public"."workflow_action_type" ADD VALUE 'send_whatsapp_draft';
