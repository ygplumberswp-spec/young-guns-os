-- Row 100 — Supplier quote/PDF → BOQ matching
-- Additive. Staging-safe. Does not mutate BOQ source, catalogue, quote sell, Row 92, or Xero.
-- Multi-signal proposals only. Row 101 comparison not started.

CREATE TABLE IF NOT EXISTS supplier_quote_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  boq_import_id uuid NOT NULL REFERENCES boq_imports(id) ON DELETE CASCADE,
  supplier_id uuid,
  supplier_name text,
  source_document_id uuid,
  original_filename text NOT NULL,
  file_hash_sha256 text NOT NULL,
  revision_label text,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  storage_key text,
  status text NOT NULL DEFAULT 'REVIEW_REQUIRED',
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  aura_narrative_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text,
  client_action_id text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_quote_imports_status_chk CHECK (status IN (
    'DRAFT','REVIEW_REQUIRED','REVIEWED','SUPERSEDED'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_quote_imports_company_idempotency_uidx
  ON supplier_quote_imports (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS supplier_quote_imports_company_client_action_uidx
  ON supplier_quote_imports (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS supplier_quote_imports_company_boq_idx
  ON supplier_quote_imports (company_id, boq_import_id);

CREATE TABLE IF NOT EXISTS supplier_quote_import_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_id uuid NOT NULL REFERENCES supplier_quote_imports(id) ON DELETE CASCADE,
  client_key text NOT NULL,
  source_line_order integer NOT NULL,
  page_number integer,
  supplier_sku text,
  manufacturer_code text,
  description text,
  unit text,
  quantity numeric(18,4),
  pack_size numeric(18,4),
  unit_price_cents integer,
  vat_basis text NOT NULL DEFAULT 'UNKNOWN',
  currency text,
  price_valid_to text,
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_quote_import_lines_vat_chk CHECK (vat_basis IN (
    'INCLUSIVE','EXCLUSIVE','UNKNOWN'
  ))
);

CREATE INDEX IF NOT EXISTS supplier_quote_import_lines_import_order_idx
  ON supplier_quote_import_lines (import_id, source_line_order);

CREATE TABLE IF NOT EXISTS supplier_quote_boq_match_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_quote_import_id uuid NOT NULL REFERENCES supplier_quote_imports(id) ON DELETE CASCADE,
  supplier_line_id uuid REFERENCES supplier_quote_import_lines(id) ON DELETE SET NULL,
  boq_import_id uuid NOT NULL REFERENCES boq_imports(id) ON DELETE CASCADE,
  boq_import_row_id uuid REFERENCES boq_import_rows(id) ON DELETE SET NULL,
  proposal_key text NOT NULL,
  match_state text NOT NULL,
  signals_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_score integer NOT NULL DEFAULT 0,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  supplier_sku text,
  manufacturer_code text,
  description text,
  unit text,
  quantity numeric(18,4),
  pack_size numeric(18,4),
  unit_price_cents integer,
  vat_basis text NOT NULL DEFAULT 'UNKNOWN',
  currency text,
  price_valid_to text,
  human_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_quote_boq_match_proposals_state_chk CHECK (match_state IN (
    'EXACT','HIGH_CONFIDENCE','POSSIBLE','AMBIGUOUS','UNMATCHED',
    'REVIEW_REQUIRED','REJECTED','CONFIRMED'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_quote_boq_match_proposals_import_key_uidx
  ON supplier_quote_boq_match_proposals (supplier_quote_import_id, proposal_key);

CREATE INDEX IF NOT EXISTS supplier_quote_boq_match_proposals_boq_idx
  ON supplier_quote_boq_match_proposals (company_id, boq_import_id);

COMMENT ON TABLE supplier_quote_imports IS
  'Row 100: supplier quote/PDF import for multi-signal BOQ matching. Prices are evidence only.';

COMMENT ON TABLE supplier_quote_boq_match_proposals IS
  'Row 100: match proposals. Never match by sequence alone. No auto catalogue/quote pricing.';
