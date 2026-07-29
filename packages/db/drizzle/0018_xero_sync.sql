CREATE TYPE "public"."xero_sync_entity_status" AS ENUM('pending', 'synced', 'failed', 'out_of_sync');--> statement-breakpoint
CREATE TYPE "public"."xero_sync_log_action" AS ENUM('push', 'pull', 'update', 'link');--> statement-breakpoint
CREATE TYPE "public"."xero_sync_log_status" AS ENUM('success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."xero_sync_entity_type" AS ENUM('customer', 'quote', 'invoice', 'payment');--> statement-breakpoint
ALTER TABLE "integration_sync_jobs" ADD COLUMN "sync_scope" text;--> statement-breakpoint
CREATE TABLE "xero_customer_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"integration_connection_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"xero_contact_id" text,
	"sync_status" "xero_sync_entity_status" DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_successful_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xero_quote_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"integration_connection_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"xero_quote_id" text,
	"sync_status" "xero_sync_entity_status" DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_successful_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xero_invoice_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"integration_connection_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"xero_invoice_id" text,
	"sync_status" "xero_sync_entity_status" DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_successful_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xero_payment_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"integration_connection_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"xero_payment_id" text,
	"sync_status" "xero_sync_entity_status" DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_successful_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xero_sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"integration_connection_id" uuid NOT NULL,
	"sync_job_id" uuid,
	"entity_type" "xero_sync_entity_type" NOT NULL,
	"entity_id" uuid,
	"xero_entity_id" text,
	"action" "xero_sync_log_action" NOT NULL,
	"status" "xero_sync_log_status" NOT NULL,
	"message" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "xero_customer_mappings" ADD CONSTRAINT "xero_customer_mappings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "xero_customer_mappings" ADD CONSTRAINT "xero_customer_mappings_integration_connection_id_integration_connections_id_fk" FOREIGN KEY ("integration_connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "xero_customer_mappings" ADD CONSTRAINT "xero_customer_mappings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "xero_quote_mappings" ADD CONSTRAINT "xero_quote_mappings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "xero_quote_mappings" ADD CONSTRAINT "xero_quote_mappings_integration_connection_id_integration_connections_id_fk" FOREIGN KEY ("integration_connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "xero_quote_mappings" ADD CONSTRAINT "xero_quote_mappings_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "xero_invoice_mappings" ADD CONSTRAINT "xero_invoice_mappings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "xero_invoice_mappings" ADD CONSTRAINT "xero_invoice_mappings_integration_connection_id_integration_connections_id_fk" FOREIGN KEY ("integration_connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "xero_invoice_mappings" ADD CONSTRAINT "xero_invoice_mappings_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "xero_payment_mappings" ADD CONSTRAINT "xero_payment_mappings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "xero_payment_mappings" ADD CONSTRAINT "xero_payment_mappings_integration_connection_id_integration_connections_id_fk" FOREIGN KEY ("integration_connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "xero_payment_mappings" ADD CONSTRAINT "xero_payment_mappings_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "xero_sync_logs" ADD CONSTRAINT "xero_sync_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "xero_sync_logs" ADD CONSTRAINT "xero_sync_logs_integration_connection_id_integration_connections_id_fk" FOREIGN KEY ("integration_connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "xero_sync_logs" ADD CONSTRAINT "xero_sync_logs_sync_job_id_integration_sync_jobs_id_fk" FOREIGN KEY ("sync_job_id") REFERENCES "public"."integration_sync_jobs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "xero_customer_mappings_company_customer_idx" ON "xero_customer_mappings" USING btree ("company_id", "customer_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "xero_customer_mappings_company_xero_contact_idx" ON "xero_customer_mappings" USING btree ("company_id", "xero_contact_id");
--> statement-breakpoint
CREATE INDEX "xero_customer_mappings_company_id_idx" ON "xero_customer_mappings" USING btree ("company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "xero_quote_mappings_company_quote_idx" ON "xero_quote_mappings" USING btree ("company_id", "quote_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "xero_quote_mappings_company_xero_quote_idx" ON "xero_quote_mappings" USING btree ("company_id", "xero_quote_id");
--> statement-breakpoint
CREATE INDEX "xero_quote_mappings_company_id_idx" ON "xero_quote_mappings" USING btree ("company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "xero_invoice_mappings_company_invoice_idx" ON "xero_invoice_mappings" USING btree ("company_id", "invoice_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "xero_invoice_mappings_company_xero_invoice_idx" ON "xero_invoice_mappings" USING btree ("company_id", "xero_invoice_id");
--> statement-breakpoint
CREATE INDEX "xero_invoice_mappings_company_id_idx" ON "xero_invoice_mappings" USING btree ("company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "xero_payment_mappings_company_payment_idx" ON "xero_payment_mappings" USING btree ("company_id", "payment_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "xero_payment_mappings_company_xero_payment_idx" ON "xero_payment_mappings" USING btree ("company_id", "xero_payment_id");
--> statement-breakpoint
CREATE INDEX "xero_payment_mappings_company_id_idx" ON "xero_payment_mappings" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "xero_sync_logs_company_id_idx" ON "xero_sync_logs" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "xero_sync_logs_company_created_idx" ON "xero_sync_logs" USING btree ("company_id", "created_at");
--> statement-breakpoint
CREATE INDEX "xero_sync_logs_sync_job_id_idx" ON "xero_sync_logs" USING btree ("sync_job_id");
--> statement-breakpoint
CREATE INDEX "integration_sync_jobs_company_scope_idx" ON "integration_sync_jobs" USING btree ("company_id", "provider", "sync_scope");
