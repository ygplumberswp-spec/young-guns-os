ALTER TYPE "public"."integration_provider" ADD VALUE 'gmail';--> statement-breakpoint
CREATE TYPE "public"."gmail_connection_status" AS ENUM('disconnected', 'pending', 'connected', 'error');--> statement-breakpoint
CREATE TYPE "public"."gmail_message_direction" AS ENUM('incoming', 'outgoing');--> statement-breakpoint
CREATE TYPE "public"."gmail_message_status" AS ENUM('draft', 'pending', 'sent', 'received', 'failed');--> statement-breakpoint
CREATE TABLE "gmail_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"email" text,
	"credentials_encrypted" text,
	"tokens_encrypted" text,
	"status" "gmail_connection_status" DEFAULT 'disconnected' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gmail_connections_company_id_unique" UNIQUE("company_id")
);--> statement-breakpoint
CREATE TABLE "gmail_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"external_label_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"message_list_visibility" text,
	"label_list_visibility" text,
	"messages_total" integer,
	"messages_unread" integer,
	"threads_total" integer,
	"threads_unread" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "gmail_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid,
	"external_message_id" text NOT NULL,
	"external_thread_id" text,
	"direction" "gmail_message_direction" NOT NULL,
	"status" "gmail_message_status" DEFAULT 'received' NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"subject" text,
	"snippet" text,
	"from_email" text,
	"to_email" text,
	"cc_email" text,
	"bcc_email" text,
	"headers" jsonb,
	"payload" jsonb,
	"body_html" text,
	"body_text" text,
	"label_ids" jsonb DEFAULT '[]'::jsonb,
	"history_id" text,
	"internal_date" timestamp with time zone,
	"size_estimate" text,
	"approved_by_user_id" uuid,
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "gmail_connections" ADD CONSTRAINT "gmail_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_labels" ADD CONSTRAINT "gmail_labels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_messages" ADD CONSTRAINT "gmail_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_messages" ADD CONSTRAINT "gmail_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_messages" ADD CONSTRAINT "gmail_messages_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gmail_connections_company_id_idx" ON "gmail_connections" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "gmail_labels_company_id_idx" ON "gmail_labels" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "gmail_labels_external_label_id_idx" ON "gmail_labels" USING btree ("external_label_id");--> statement-breakpoint
CREATE INDEX "gmail_messages_company_id_idx" ON "gmail_messages" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "gmail_messages_customer_id_idx" ON "gmail_messages" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "gmail_messages_external_message_id_idx" ON "gmail_messages" USING btree ("external_message_id");--> statement-breakpoint
CREATE INDEX "gmail_messages_direction_idx" ON "gmail_messages" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "gmail_messages_status_idx" ON "gmail_messages" USING btree ("status");
