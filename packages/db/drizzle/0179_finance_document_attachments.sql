-- Phase J-6.4: finance quote/invoice photos & attachments.
-- Apply only via apply-0179-staging-only.mjs after Owner-approved staging backup.

DO $$ BEGIN
  CREATE TYPE "finance_attachment_source" AS ENUM ('upload', 'job_evidence');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance_document_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "quote_id" uuid REFERENCES "quotes"("id") ON DELETE cascade,
  "invoice_id" uuid REFERENCES "invoices"("id") ON DELETE cascade,
  "draft_client_action_id" text,
  "source" "finance_attachment_source" DEFAULT 'upload' NOT NULL,
  "job_id" uuid REFERENCES "jobs"("id") ON DELETE set null,
  "documentation_id" uuid,
  "storage_key" text,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "caption" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "include_in_pdf" boolean DEFAULT false NOT NULL,
  "checksum_sha256" text,
  "uploaded_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "client_action_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_document_attachments_quote_idx" ON "finance_document_attachments" ("company_id","quote_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_document_attachments_invoice_idx" ON "finance_document_attachments" ("company_id","invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_document_attachments_draft_idx" ON "finance_document_attachments" ("company_id","draft_client_action_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_document_attachments_quote_evidence_unique" ON "finance_document_attachments" ("company_id","quote_id","documentation_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_document_attachments_invoice_evidence_unique" ON "finance_document_attachments" ("company_id","invoice_id","documentation_id");
