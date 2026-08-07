-- Phase 9: BOQ workspace foundation + tender quote link
-- Forward-only. Disposable / staging only — never apply to live from this change set.

DO $$ BEGIN
  CREATE TYPE boq_status AS ENUM ('draft', 'in_review', 'approved', 'converted', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS boq_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  boq_number text NOT NULL,
  title text NOT NULL,
  status boq_status NOT NULL DEFAULT 'draft',
  source_filename text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS boq_documents_company_id_idx ON boq_documents(company_id);
CREATE INDEX IF NOT EXISTS boq_documents_quote_id_idx ON boq_documents(quote_id);

CREATE TABLE IF NOT EXISTS boq_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  boq_document_id uuid NOT NULL REFERENCES boq_documents(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  section text,
  item_number text,
  description text NOT NULL,
  unit text,
  quantity numeric(18, 4) NOT NULL DEFAULT 1,
  unit_cost_cents integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS boq_line_items_document_id_idx ON boq_line_items(boq_document_id);

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS boq_document_id uuid REFERENCES boq_documents(id) ON DELETE SET NULL;

ALTER TABLE si_tenders
  ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL;
