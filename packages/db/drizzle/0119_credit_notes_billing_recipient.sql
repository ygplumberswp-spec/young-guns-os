-- Credit notes internal entity + billing recipient fields (Phase 256 final blocker pass)
CREATE TYPE "credit_note_status" AS ENUM (
  'draft',
  'pending_approval',
  'approved',
  'approved_awaiting_provider_write',
  'executed',
  'failed',
  'cancelled'
);

CREATE TABLE IF NOT EXISTS "credit_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "invoice_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "job_id" uuid,
  "status" "credit_note_status" DEFAULT 'draft' NOT NULL,
  "reason" text NOT NULL,
  "subtotal_cents" integer DEFAULT 0 NOT NULL,
  "vat_cents" integer DEFAULT 0 NOT NULL,
  "total_cents" integer DEFAULT 0 NOT NULL,
  "invoice_balance_preview_cents" integer,
  "provider_reference" text,
  "xero_write_approval_id" uuid,
  "idempotency_key" text,
  "error_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid,
  "approved_by_user_id" uuid,
  "approved_at" timestamp with time zone,
  "executed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "credit_note_line_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "credit_note_id" uuid NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "description" text NOT NULL,
  "quantity" text DEFAULT '1' NOT NULL,
  "unit_price_cents" integer DEFAULT 0 NOT NULL,
  "vat_rate_bps" integer DEFAULT 1500 NOT NULL,
  "line_subtotal_cents" integer DEFAULT 0 NOT NULL,
  "line_vat_cents" integer DEFAULT 0 NOT NULL,
  "line_total_cents" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "billing_customer_id" uuid;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "recipient_name" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "recipient_email" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "recipient_phone" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "billing_address" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "vat_number" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "po_reference" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "attention_person" text;

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "billing_customer_id" uuid;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "recipient_name" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "recipient_email" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "recipient_phone" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "billing_address" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "vat_number" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "po_reference" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "attention_person" text;

DO $$ BEGIN
 ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_xero_write_approval_id_xero_write_approvals_id_fk" FOREIGN KEY ("xero_write_approval_id") REFERENCES "public"."xero_write_approvals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "credit_note_line_items" ADD CONSTRAINT "credit_note_line_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "credit_note_line_items" ADD CONSTRAINT "credit_note_line_items_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "quotes" ADD CONSTRAINT "quotes_billing_customer_id_customers_id_fk" FOREIGN KEY ("billing_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_customer_id_customers_id_fk" FOREIGN KEY ("billing_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "credit_notes_idempotency_uq" ON "credit_notes" USING btree ("company_id","idempotency_key") WHERE "idempotency_key" IS NOT NULL;
