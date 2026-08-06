-- Xero Complete Historical Sync & Financial Memory
--
-- Adds the Xero entities that had no home in TITAN (chart of accounts, tracking categories,
-- supplier bills, credit notes, payment allocations, attachment metadata) plus per-entity import
-- coverage. Read-only financial history: Xero remains the accounting source of truth and none of
-- these tables form a second ledger.

-- Sync log entity types for the newly imported entities. Every skipped or failed record of these
-- kinds gets a log row, so these values must exist before the import stages can run.
ALTER TYPE "xero_sync_entity_type" ADD VALUE IF NOT EXISTS 'bill';
ALTER TYPE "xero_sync_entity_type" ADD VALUE IF NOT EXISTS 'credit_note';
ALTER TYPE "xero_sync_entity_type" ADD VALUE IF NOT EXISTS 'account';
ALTER TYPE "xero_sync_entity_type" ADD VALUE IF NOT EXISTS 'tracking_category';
ALTER TYPE "xero_sync_entity_type" ADD VALUE IF NOT EXISTS 'attachment';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "xero_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "integration_connection_id" uuid NOT NULL REFERENCES "integration_connections"("id") ON DELETE cascade,
  "xero_account_id" text NOT NULL,
  "code" text,
  "name" text NOT NULL,
  "type" text,
  "tax_type" text,
  "account_class" text,
  "status" text,
  "description" text,
  "reporting_code" text,
  "source_provider" text DEFAULT 'xero' NOT NULL,
  "source_synced_at" timestamp with time zone,
  "source_import_job_id" uuid REFERENCES "integration_sync_jobs"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "xero_accounts_company_account_unique" UNIQUE("company_id","xero_account_id")
);

CREATE INDEX IF NOT EXISTS "xero_accounts_company_code_idx" ON "xero_accounts" ("company_id","code");

CREATE TABLE IF NOT EXISTS "xero_tracking_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "integration_connection_id" uuid NOT NULL REFERENCES "integration_connections"("id") ON DELETE cascade,
  "xero_tracking_category_id" text NOT NULL,
  "name" text NOT NULL,
  "status" text,
  "source_provider" text DEFAULT 'xero' NOT NULL,
  "source_synced_at" timestamp with time zone,
  "source_import_job_id" uuid REFERENCES "integration_sync_jobs"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "xero_tracking_categories_company_category_unique" UNIQUE("company_id","xero_tracking_category_id")
);

CREATE TABLE IF NOT EXISTS "xero_tracking_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "tracking_category_id" uuid NOT NULL REFERENCES "xero_tracking_categories"("id") ON DELETE cascade,
  "xero_tracking_option_id" text NOT NULL,
  "name" text NOT NULL,
  "status" text,
  "source_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "xero_tracking_options_company_option_unique" UNIQUE("company_id","xero_tracking_option_id")
);

CREATE TABLE IF NOT EXISTS "xero_bills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "integration_connection_id" uuid NOT NULL REFERENCES "integration_connections"("id") ON DELETE cascade,
  "xero_invoice_id" text NOT NULL,
  "xero_contact_id" text,
  "supplier_name" text,
  "bill_number" text,
  "reference" text,
  "status" text,
  "subtotal_cents" integer DEFAULT 0 NOT NULL,
  "tax_cents" integer DEFAULT 0 NOT NULL,
  "total_cents" integer DEFAULT 0 NOT NULL,
  "amount_due_cents" integer DEFAULT 0 NOT NULL,
  "amount_paid_cents" integer DEFAULT 0 NOT NULL,
  "currency" text,
  "issue_date" date,
  "due_date" date,
  "source_provider" text DEFAULT 'xero' NOT NULL,
  "source_synced_at" timestamp with time zone,
  "source_import_job_id" uuid REFERENCES "integration_sync_jobs"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "xero_bills_company_invoice_unique" UNIQUE("company_id","xero_invoice_id")
);

CREATE INDEX IF NOT EXISTS "xero_bills_company_issue_date_idx" ON "xero_bills" ("company_id","issue_date");
CREATE INDEX IF NOT EXISTS "xero_bills_company_contact_idx" ON "xero_bills" ("company_id","xero_contact_id");

CREATE TABLE IF NOT EXISTS "xero_bill_line_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "bill_id" uuid NOT NULL REFERENCES "xero_bills"("id") ON DELETE cascade,
  "xero_line_item_id" text,
  "position" integer DEFAULT 0 NOT NULL,
  "description" text,
  "quantity" integer DEFAULT 1 NOT NULL,
  "unit_amount_cents" integer DEFAULT 0 NOT NULL,
  "line_amount_cents" integer DEFAULT 0 NOT NULL,
  "tax_amount_cents" integer DEFAULT 0 NOT NULL,
  "account_code" text,
  "tax_type" text,
  "tracking" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "xero_bill_line_items_bill_idx" ON "xero_bill_line_items" ("company_id","bill_id");
CREATE INDEX IF NOT EXISTS "xero_bill_line_items_account_code_idx" ON "xero_bill_line_items" ("company_id","account_code");

CREATE TABLE IF NOT EXISTS "xero_credit_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "integration_connection_id" uuid NOT NULL REFERENCES "integration_connections"("id") ON DELETE cascade,
  "xero_credit_note_id" text NOT NULL,
  "credit_note_number" text,
  "xero_contact_id" text,
  "contact_name" text,
  "type" text,
  "status" text,
  "subtotal_cents" integer DEFAULT 0 NOT NULL,
  "tax_cents" integer DEFAULT 0 NOT NULL,
  "total_cents" integer DEFAULT 0 NOT NULL,
  "remaining_credit_cents" integer DEFAULT 0 NOT NULL,
  "currency" text,
  "issue_date" date,
  "reference" text,
  "source_provider" text DEFAULT 'xero' NOT NULL,
  "source_synced_at" timestamp with time zone,
  "source_import_job_id" uuid REFERENCES "integration_sync_jobs"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "xero_credit_notes_company_note_unique" UNIQUE("company_id","xero_credit_note_id")
);

CREATE INDEX IF NOT EXISTS "xero_credit_notes_company_contact_idx" ON "xero_credit_notes" ("company_id","xero_contact_id");

CREATE TABLE IF NOT EXISTS "xero_credit_note_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "credit_note_id" uuid NOT NULL REFERENCES "xero_credit_notes"("id") ON DELETE cascade,
  "xero_invoice_id" text,
  "amount_cents" integer DEFAULT 0 NOT NULL,
  "allocated_on" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "xero_credit_note_allocations_note_idx" ON "xero_credit_note_allocations" ("company_id","credit_note_id");

CREATE TABLE IF NOT EXISTS "xero_payment_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "integration_connection_id" uuid NOT NULL REFERENCES "integration_connections"("id") ON DELETE cascade,
  "xero_payment_id" text NOT NULL,
  "xero_invoice_id" text,
  "target_type" text DEFAULT 'invoice' NOT NULL,
  "amount_cents" integer DEFAULT 0 NOT NULL,
  "currency" text,
  "paid_on" date,
  "reference" text,
  "status" text,
  "unresolved" boolean DEFAULT false NOT NULL,
  "unresolved_reason" text,
  "source_synced_at" timestamp with time zone,
  "source_import_job_id" uuid REFERENCES "integration_sync_jobs"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "xero_payment_allocations_company_payment_unique" UNIQUE("company_id","xero_payment_id")
);

CREATE INDEX IF NOT EXISTS "xero_payment_allocations_company_invoice_idx" ON "xero_payment_allocations" ("company_id","xero_invoice_id");

CREATE TABLE IF NOT EXISTS "xero_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "integration_connection_id" uuid NOT NULL REFERENCES "integration_connections"("id") ON DELETE cascade,
  "xero_attachment_id" text NOT NULL,
  "parent_type" text NOT NULL,
  "parent_xero_id" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text,
  "content_length" integer,
  "xero_url" text,
  "include_online" boolean DEFAULT false NOT NULL,
  "document_id" uuid,
  "source_provider" text DEFAULT 'xero' NOT NULL,
  "source_synced_at" timestamp with time zone,
  "source_import_job_id" uuid REFERENCES "integration_sync_jobs"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "xero_attachments_company_attachment_unique" UNIQUE("company_id","xero_attachment_id")
);

CREATE INDEX IF NOT EXISTS "xero_attachments_parent_idx" ON "xero_attachments" ("company_id","parent_type","parent_xero_id");

CREATE TABLE IF NOT EXISTS "xero_entity_coverage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "integration_connection_id" uuid NOT NULL REFERENCES "integration_connections"("id") ON DELETE cascade,
  "entity" text NOT NULL,
  "modified_since_watermark" timestamp with time zone,
  "full_history_synced_at" timestamp with time zone,
  "last_synced_at" timestamp with time zone,
  "last_sync_job_id" uuid REFERENCES "integration_sync_jobs"("id") ON DELETE set null,
  "imported_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "skipped_count" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "xero_entity_coverage_company_entity_unique" UNIQUE("company_id","entity")
);
