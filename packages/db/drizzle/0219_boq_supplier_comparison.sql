-- Row 101 — BOQ supplier comparison + split purchasing DRAFT proposals
-- Additive. Staging-safe. No PO / bill / Xero / stock / quote mutation.

CREATE TABLE IF NOT EXISTS boq_split_purchase_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  boq_import_id uuid NOT NULL REFERENCES boq_imports(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'DRAFT',
  idempotency_key text,
  client_action_id text,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  aura_narrative_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  supplier_subtotal_cents integer,
  vat_cents integer,
  delivery_cents integer,
  total_proposed_purchasing_cost_cents integer,
  totals_incomplete boolean NOT NULL DEFAULT true,
  missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boq_split_purchase_proposals_status_chk CHECK (status IN (
    'DRAFT','REVIEW_REQUIRED','REVIEWED','APPROVED_DRAFT','SUPERSEDED'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS boq_split_purchase_proposals_company_idempotency_uidx
  ON boq_split_purchase_proposals (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS boq_split_purchase_proposals_company_client_action_uidx
  ON boq_split_purchase_proposals (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS boq_split_purchase_proposals_company_boq_idx
  ON boq_split_purchase_proposals (company_id, boq_import_id);

CREATE TABLE IF NOT EXISTS boq_split_purchase_proposal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES boq_split_purchase_proposals(id) ON DELETE CASCADE,
  boq_import_id uuid NOT NULL REFERENCES boq_imports(id) ON DELETE CASCADE,
  boq_import_row_id uuid NOT NULL REFERENCES boq_import_rows(id) ON DELETE CASCADE,
  offer_key text NOT NULL,
  supplier_id uuid,
  supplier_name text NOT NULL,
  supplier_document_ref text,
  row100_proposal_key text,
  quantity_proposed numeric(18,4),
  unit_price_cents integer,
  vat_basis text NOT NULL DEFAULT 'UNKNOWN',
  line_subtotal_cents integer,
  line_vat_cents integer,
  delivery_cents integer,
  expected_supplier_cost_cents integer,
  mismatch_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_substitute boolean NOT NULL DEFAULT false,
  source_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boq_split_purchase_proposal_lines_vat_chk CHECK (vat_basis IN (
    'INCLUSIVE','EXCLUSIVE','UNKNOWN'
  ))
);

CREATE INDEX IF NOT EXISTS boq_split_purchase_proposal_lines_proposal_idx
  ON boq_split_purchase_proposal_lines (proposal_id, position);

COMMENT ON TABLE boq_split_purchase_proposals IS
  'Row 101: DRAFT split-purchasing proposals. No PO/bill/Xero execution.';
