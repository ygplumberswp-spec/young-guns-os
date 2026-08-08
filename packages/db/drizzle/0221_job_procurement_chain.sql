-- Row 103 — Job-linked procurement chain traceability
-- Additive overlays over existing PO / inventory / JPE. No parallel engines.
-- Staging-safe. Zero real Xero writes from this migration.

CREATE TABLE IF NOT EXISTS job_procurement_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  boq_import_id uuid REFERENCES boq_imports(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  split_proposal_id uuid REFERENCES boq_split_purchase_proposals(id) ON DELETE SET NULL,
  purchase_path text NOT NULL DEFAULT 'DIRECT_TO_JOB',
  status text NOT NULL DEFAULT 'DRAFT',
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  aura_narrative_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text,
  client_action_id text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_procurement_chains_path_chk CHECK (purchase_path IN (
    'DIRECT_TO_JOB','STOCK'
  )),
  CONSTRAINT job_procurement_chains_status_chk CHECK (status IN (
    'DRAFT','PO_DRAFT','PO_APPROVED','DELIVERED_PARTIAL','DELIVERED',
    'INVOICED','COST_POSTED','BLOCKED','SUPERSEDED'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS job_procurement_chains_company_idempotency_uidx
  ON job_procurement_chains (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS job_procurement_chains_company_client_action_uidx
  ON job_procurement_chains (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_procurement_chains_company_job_idx
  ON job_procurement_chains (company_id, job_id);

CREATE TABLE IF NOT EXISTS job_procurement_chain_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  chain_id uuid NOT NULL REFERENCES job_procurement_chains(id) ON DELETE CASCADE,
  boq_import_row_id uuid REFERENCES boq_import_rows(id) ON DELETE SET NULL,
  quote_line_id uuid,
  split_proposal_line_id uuid REFERENCES boq_split_purchase_proposal_lines(id) ON DELETE SET NULL,
  row100_proposal_key text,
  offer_key text,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  purchase_order_line_id uuid REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  delivery_evidence_id uuid,
  supplier_invoice_evidence_id uuid,
  xero_bill_id uuid REFERENCES xero_bills(id) ON DELETE SET NULL,
  xero_invoice_id text,
  stock_movement_id uuid,
  material_use_transaction_id text,
  jpe_source_type text,
  jpe_source_id text,
  cost_authority text,
  quantity numeric(18,4),
  unit_price_cents integer,
  line_cost_cents integer,
  vat_basis text,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_procurement_chain_links_authority_chk CHECK (
    cost_authority IS NULL OR cost_authority IN (
      'direct_to_job_invoice','stock_receipt_only','stock_material_use','suppressed_duplicate'
    )
  )
);

CREATE INDEX IF NOT EXISTS job_procurement_chain_links_chain_idx
  ON job_procurement_chain_links (chain_id, position);

CREATE UNIQUE INDEX IF NOT EXISTS job_procurement_chain_links_jpe_uidx
  ON job_procurement_chain_links (company_id, jpe_source_type, jpe_source_id)
  WHERE jpe_source_id IS NOT NULL AND jpe_source_type IS NOT NULL;

CREATE TABLE IF NOT EXISTS job_procurement_delivery_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  chain_id uuid NOT NULL REFERENCES job_procurement_chains(id) ON DELETE CASCADE,
  chain_link_id uuid REFERENCES job_procurement_chain_links(id) ON DELETE SET NULL,
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  purchase_order_line_id uuid NOT NULL REFERENCES purchase_order_items(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  delivered_quantity numeric(18,4),
  delivered_at timestamptz,
  delivery_reference text,
  is_partial boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_procurement_supplier_invoice_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  chain_id uuid NOT NULL REFERENCES job_procurement_chains(id) ON DELETE CASCADE,
  chain_link_id uuid REFERENCES job_procurement_chain_links(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  purchase_order_line_id uuid REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  delivery_evidence_id uuid REFERENCES job_procurement_delivery_evidence(id) ON DELETE SET NULL,
  invoice_number text,
  invoice_date date,
  source_document_ref text,
  line_quantity numeric(18,4),
  line_cost_cents integer,
  vat_basis text,
  missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE job_procurement_chains IS
  'Row 103: Job-linked procurement chain. Reuses existing PO/JPE; no parallel engine.';
COMMENT ON TABLE job_procurement_supplier_invoice_evidence IS
  'Row 103: supplier invoice evidence for one Job allocation (no Row105 multi-job split).';
