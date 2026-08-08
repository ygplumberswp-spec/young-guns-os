-- Row 99 — Canonical BOQ Workbook Import
-- Additive only. Staging-safe. Preserves workbook structure/provenance.
-- No automatic pricing, supplier matching, Xero writes, or quote revenue.

CREATE TABLE IF NOT EXISTS boq_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_document_id uuid,
  original_filename text NOT NULL,
  file_hash_sha256 text NOT NULL,
  revision_label text,
  import_version integer NOT NULL DEFAULT 1,
  workbook_identity text,
  mime_type text NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  storage_key text,
  status text NOT NULL DEFAULT 'REVIEW_REQUIRED',
  sheet_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  aura_narrative_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  boq_document_id uuid REFERENCES boq_documents(id) ON DELETE SET NULL,
  superseded_by uuid,
  client_action_id text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boq_imports_status_chk CHECK (status IN (
    'DRAFT','REVIEW_REQUIRED','REVIEWED','SUPERSEDED'
  )),
  CONSTRAINT boq_imports_version_chk CHECK (import_version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS boq_imports_company_hash_version_uidx
  ON boq_imports (company_id, file_hash_sha256, import_version);

CREATE UNIQUE INDEX IF NOT EXISTS boq_imports_company_client_action_uidx
  ON boq_imports (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS boq_imports_company_status_idx
  ON boq_imports (company_id, status);

CREATE TABLE IF NOT EXISTS boq_import_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_id uuid NOT NULL REFERENCES boq_imports(id) ON DELETE CASCADE,
  sheet_name text NOT NULL,
  sheet_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boq_import_sheets_order_chk CHECK (sheet_order >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS boq_import_sheets_import_order_uidx
  ON boq_import_sheets (import_id, sheet_order);

CREATE INDEX IF NOT EXISTS boq_import_sheets_company_import_idx
  ON boq_import_sheets (company_id, import_id);

CREATE TABLE IF NOT EXISTS boq_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_id uuid NOT NULL REFERENCES boq_imports(id) ON DELETE CASCADE,
  sheet_id uuid NOT NULL REFERENCES boq_import_sheets(id) ON DELETE CASCADE,
  sheet_name text NOT NULL,
  sheet_order integer NOT NULL,
  original_row_number integer NOT NULL,
  original_row_order integer NOT NULL,
  section_label text,
  section_known boolean NOT NULL DEFAULT false,
  row_kind text NOT NULL DEFAULT 'UNKNOWN',
  item_code text,
  description text,
  unit text,
  quantity numeric(18,4),
  raw_value text,
  display_value text,
  formula_text text,
  cell_address text,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_state text NOT NULL DEFAULT 'REVIEW_REQUIRED',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boq_import_rows_kind_chk CHECK (row_kind IN (
    'HEADER','SECTION','ITEM','SPACER','UNKNOWN'
  )),
  CONSTRAINT boq_import_rows_review_chk CHECK (review_state IN (
    'OK','REVIEW_REQUIRED'
  ))
);

CREATE INDEX IF NOT EXISTS boq_import_rows_import_order_idx
  ON boq_import_rows (import_id, sheet_order, original_row_order);

CREATE INDEX IF NOT EXISTS boq_import_rows_company_import_idx
  ON boq_import_rows (company_id, import_id);

COMMENT ON TABLE boq_imports IS
  'Row 99: immutable BOQ workbook import snapshot. Changed file hash => new revision.';

COMMENT ON COLUMN boq_import_rows.formula_text IS
  'Exact formula text from source. Never executed/recalculated by Titan.';
