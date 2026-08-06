-- SPI-001 Supplier Price Intelligence scaffolding
CREATE TYPE "supplier_price_import_status" AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'review_required'
);

CREATE TYPE "supplier_price_line_status" AS ENUM (
  'raw',
  'matched',
  'review',
  'approved',
  'rejected',
  'uncertain'
);

CREATE TYPE "supplier_price_dedup_verdict" AS ENUM (
  'new',
  'duplicate',
  'variant',
  'uncertain'
);

CREATE TABLE IF NOT EXISTS "supplier_price_import_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "supplier_id" uuid REFERENCES "suppliers"("id") ON DELETE set null,
  "source_filename" text,
  "source_type" text NOT NULL DEFAULT 'manual',
  "status" "supplier_price_import_status" NOT NULL DEFAULT 'pending',
  "line_count" integer NOT NULL DEFAULT 0,
  "review_count" integer NOT NULL DEFAULT 0,
  "error_message" text,
  "result_summary" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "supplier_price_import_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "import_job_id" uuid NOT NULL REFERENCES "supplier_price_import_jobs"("id") ON DELETE cascade,
  "supplier_id" uuid REFERENCES "suppliers"("id") ON DELETE set null,
  "line_number" integer NOT NULL DEFAULT 1,
  "supplier_code" text,
  "description" text NOT NULL,
  "unit" text,
  "pack_size" text,
  "unit_cost_cents" integer NOT NULL DEFAULT 0,
  "vat_included" boolean NOT NULL DEFAULT false,
  "effective_date" timestamp with time zone,
  "status" "supplier_price_line_status" NOT NULL DEFAULT 'raw',
  "dedup_verdict" "supplier_price_dedup_verdict" NOT NULL DEFAULT 'uncertain',
  "catalogue_item_id" uuid,
  "raw_payload" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "supplier_price_catalogue_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "supplier_id" uuid REFERENCES "suppliers"("id") ON DELETE set null,
  "canonical_code" text,
  "description" text NOT NULL,
  "normalized_description" text NOT NULL,
  "unit" text,
  "pack_size" text,
  "unit_cost_cents" integer NOT NULL DEFAULT 0,
  "vat_included" boolean NOT NULL DEFAULT false,
  "version" integer NOT NULL DEFAULT 1,
  "previous_version_id" uuid,
  "effective_from" timestamp with time zone,
  "approved_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "approved_at" timestamp with time zone,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "supplier_price_review_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "import_line_id" uuid NOT NULL REFERENCES "supplier_price_import_lines"("id") ON DELETE cascade,
  "candidate_catalogue_item_id" uuid REFERENCES "supplier_price_catalogue_items"("id") ON DELETE set null,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "margin_impact_cents" integer,
  "resolved_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "supplier_price_import_jobs_company_idx"
  ON "supplier_price_import_jobs" ("company_id", "status");
CREATE INDEX IF NOT EXISTS "supplier_price_import_lines_job_idx"
  ON "supplier_price_import_lines" ("import_job_id", "line_number");
CREATE INDEX IF NOT EXISTS "supplier_price_catalogue_company_norm_idx"
  ON "supplier_price_catalogue_items" ("company_id", "normalized_description");
CREATE INDEX IF NOT EXISTS "supplier_price_review_queue_company_status_idx"
  ON "supplier_price_review_queue" ("company_id", "status");
