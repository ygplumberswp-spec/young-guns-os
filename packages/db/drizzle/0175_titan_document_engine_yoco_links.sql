-- TITAN Document Engine + AURA Yoco payment links.
--
-- Documents render over the existing invoice/quote/job rows: this migration adds
-- presentation and narrative storage plus the payment-link lifecycle. No money is
-- duplicated here — amounts on a payment link record only what the customer was
-- invited to pay, and Xero remains the financial source of truth.

DO $$ BEGIN
  CREATE TYPE "titan_document_type" AS ENUM ('invoice', 'quote', 'report');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "titan_report_kind" AS ENUM ('service', 'inspection', 'maintenance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "titan_document_status" AS ENUM ('draft', 'in_review', 'issued', 'superseded', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "payment_link_provider" AS ENUM ('yoco');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "payment_link_status" AS ENUM ('prepared', 'active', 'superseded', 'paid', 'cancelled', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "payment_link_event_type" AS ENUM (
    'prepared', 'approved', 'created', 'creation_failed', 'regenerated',
    'superseded', 'cancelled', 'webhook_payment_created', 'webhook_rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "titan_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "document_type" "titan_document_type" NOT NULL,
  "report_kind" "titan_report_kind",
  "status" "titan_document_status" DEFAULT 'draft' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "supersedes_document_id" uuid,
  "document_number" text NOT NULL,
  "title" text NOT NULL,
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE restrict,
  "property_id" uuid REFERENCES "cx_customer_properties"("id") ON DELETE set null,
  "job_id" uuid REFERENCES "jobs"("id") ON DELETE set null,
  "invoice_id" uuid REFERENCES "invoices"("id") ON DELETE cascade,
  "quote_id" uuid REFERENCES "quotes"("id") ON DELETE cascade,
  "sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "content" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "coc_documentation_id" uuid,
  -- A report kind is required for reports and meaningless for finance documents.
  CONSTRAINT "titan_documents_report_kind_match" CHECK (
    ("document_type" = 'report' AND "report_kind" IS NOT NULL)
    OR ("document_type" <> 'report' AND "report_kind" IS NULL)
  ),
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "issued_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "issued_at" timestamp with time zone,
  "locked_at" timestamp with time zone,
  "client_action_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "titan_documents_company_type_idx"
  ON "titan_documents" ("company_id", "document_type", "status");
CREATE INDEX IF NOT EXISTS "titan_documents_invoice_idx"
  ON "titan_documents" ("company_id", "invoice_id");
CREATE INDEX IF NOT EXISTS "titan_documents_quote_idx"
  ON "titan_documents" ("company_id", "quote_id");
CREATE UNIQUE INDEX IF NOT EXISTS "titan_documents_number_version_unique"
  ON "titan_documents" ("company_id", "document_number", "version");

CREATE TABLE IF NOT EXISTS "titan_document_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "document_id" uuid NOT NULL REFERENCES "titan_documents"("id") ON DELETE cascade,
  "version" integer NOT NULL,
  "status" "titan_document_status" NOT NULL,
  "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "change_summary" text,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "titan_document_versions_unique"
  ON "titan_document_versions" ("document_id", "version");

CREATE TABLE IF NOT EXISTS "invoice_payment_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "invoice_id" uuid NOT NULL REFERENCES "invoices"("id") ON DELETE cascade,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE restrict,
  "document_id" uuid REFERENCES "titan_documents"("id") ON DELETE set null,
  "provider" "payment_link_provider" DEFAULT 'yoco' NOT NULL,
  "status" "payment_link_status" DEFAULT 'prepared' NOT NULL,
  "document_version" integer DEFAULT 1 NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text DEFAULT 'ZAR' NOT NULL,
  "provider_payment_link_id" text,
  "provider_order_id" text,
  "payment_url" text,
  "provider_status" text,
  "idempotency_key" text NOT NULL,
  "audit_correlation_id" text NOT NULL,
  "reference" text,
  "description" text,
  "last_error" text,
  "prepared_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "approved_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "approved_at" timestamp with time zone,
  "issued_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "superseded_by_link_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "invoice_payment_links_amount_positive" CHECK ("amount_cents" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_payment_links_idempotency_unique"
  ON "invoice_payment_links" ("company_id", "idempotency_key");

-- The database guarantee that one invoice can never advertise two live amounts.
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_payment_links_one_live_per_invoice"
  ON "invoice_payment_links" ("invoice_id")
  WHERE "status" IN ('prepared', 'active');

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_payment_links_provider_link_unique"
  ON "invoice_payment_links" ("provider", "provider_payment_link_id");

CREATE INDEX IF NOT EXISTS "invoice_payment_links_company_status_idx"
  ON "invoice_payment_links" ("company_id", "status");

CREATE TABLE IF NOT EXISTS "invoice_payment_link_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "payment_link_id" uuid REFERENCES "invoice_payment_links"("id") ON DELETE cascade,
  "invoice_id" uuid REFERENCES "invoices"("id") ON DELETE cascade,
  "event_type" "payment_link_event_type" NOT NULL,
  "audit_correlation_id" text,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "amount_cents" integer,
  "detail" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "invoice_payment_link_events_link_idx"
  ON "invoice_payment_link_events" ("company_id", "payment_link_id");

CREATE TABLE IF NOT EXISTS "yoco_webhook_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "provider_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "provider_payment_id" text,
  "provider_payment_link_id" text,
  "payment_link_id" uuid REFERENCES "invoice_payment_links"("id") ON DELETE set null,
  "invoice_id" uuid REFERENCES "invoices"("id") ON DELETE set null,
  "payment_id" uuid REFERENCES "payments"("id") ON DELETE set null,
  "amount_cents" integer,
  "currency" text,
  "signature_verified" boolean DEFAULT false NOT NULL,
  "applied" boolean DEFAULT false NOT NULL,
  "rejection_reason" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);

-- Idempotency: the same Yoco event id, or the same Yoco payment, is applied once.
CREATE UNIQUE INDEX IF NOT EXISTS "yoco_webhook_deliveries_event_unique"
  ON "yoco_webhook_deliveries" ("company_id", "provider_event_id");
CREATE UNIQUE INDEX IF NOT EXISTS "yoco_webhook_deliveries_payment_unique"
  ON "yoco_webhook_deliveries" ("company_id", "provider_payment_id");
