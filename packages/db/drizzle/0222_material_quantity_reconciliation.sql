-- Row 104 — Material quantity reconciliation + supplier returns/credits/waste
-- Additive. Reuses Row103 chain. No Row105–107. Staging Xero writes = 0.

CREATE TABLE IF NOT EXISTS material_quantity_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  chain_id uuid REFERENCES job_procurement_chains(id) ON DELETE SET NULL,
  chain_link_id uuid REFERENCES job_procurement_chain_links(id) ON DELETE SET NULL,
  material_key text NOT NULL,
  unit text,
  quoted_qty numeric(18,4),
  ordered_qty numeric(18,4),
  received_qty numeric(18,4),
  used_qty numeric(18,4),
  returned_to_supplier_qty numeric(18,4),
  returned_to_stock_qty numeric(18,4),
  wasted_qty numeric(18,4),
  unaccounted_qty numeric(18,4),
  status text NOT NULL DEFAULT 'INCOMPLETE',
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  quote_baseline_unchanged boolean NOT NULL DEFAULT true,
  idempotency_key text,
  client_action_id text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_qty_recon_status_chk CHECK (status IN (
    'RECONCILED','REVIEW_REQUIRED','BLOCKED','INCOMPLETE'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS material_qty_recon_company_idempotency_uidx
  ON material_quantity_reconciliations (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS material_qty_recon_company_job_idx
  ON material_quantity_reconciliations (company_id, job_id);

CREATE TABLE IF NOT EXISTS material_supplier_return_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  chain_id uuid REFERENCES job_procurement_chains(id) ON DELETE SET NULL,
  chain_link_id uuid REFERENCES job_procurement_chain_links(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  purchase_order_line_id uuid REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  supplier_invoice_evidence_id uuid REFERENCES job_procurement_supplier_invoice_evidence(id) ON DELETE SET NULL,
  delivery_evidence_id uuid REFERENCES job_procurement_delivery_evidence(id) ON DELETE SET NULL,
  material_key text NOT NULL,
  quantity numeric(18,4) NOT NULL,
  unit text,
  reason text,
  source_document_ref text,
  deletes_original_receipt boolean NOT NULL DEFAULT false,
  jpe_source_id text,
  idempotency_key text,
  client_action_id text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS material_supplier_return_events_idempotency_uidx
  ON material_supplier_return_events (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS material_supplier_credit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  chain_id uuid REFERENCES job_procurement_chains(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  related_return_event_id uuid REFERENCES material_supplier_return_events(id) ON DELETE SET NULL,
  related_invoice_evidence_id uuid REFERENCES job_procurement_supplier_invoice_evidence(id) ON DELETE SET NULL,
  credit_note_ref text,
  source_document_ref text,
  amount_cents integer NOT NULL,
  vat_basis text,
  credit_date date,
  xero_credit_note_id text,
  xero_status text NOT NULL DEFAULT 'SUPPLIER_CREDIT_NOT_LINKED',
  jpe_source_id text,
  idempotency_key text,
  client_action_id text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_supplier_credit_xero_chk CHECK (xero_status IN (
    'LINKED','SUPPLIER_CREDIT_NOT_LINKED'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS material_supplier_credit_events_idempotency_uidx
  ON material_supplier_credit_events (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS material_waste_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  chain_id uuid REFERENCES job_procurement_chains(id) ON DELETE SET NULL,
  chain_link_id uuid REFERENCES job_procurement_chain_links(id) ON DELETE SET NULL,
  material_key text NOT NULL,
  quantity numeric(18,4) NOT NULL,
  unit text,
  reason text,
  source_evidence_ref text,
  jpe_source_id text,
  idempotency_key text,
  client_action_id text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS material_waste_events_idempotency_uidx
  ON material_waste_events (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS material_return_to_stock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  chain_id uuid REFERENCES job_procurement_chains(id) ON DELETE SET NULL,
  chain_link_id uuid REFERENCES job_procurement_chain_links(id) ON DELETE SET NULL,
  material_key text NOT NULL,
  quantity numeric(18,4) NOT NULL,
  unit text,
  stock_movement_id uuid,
  jpe_source_id text,
  idempotency_key text,
  client_action_id text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS material_return_to_stock_events_idempotency_uidx
  ON material_return_to_stock_events (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE material_quantity_reconciliations IS
  'Row 104: evidence-backed qty reconciliation. Missing stays unknown. Quote baseline preserved.';
COMMENT ON TABLE material_supplier_credit_events IS
  'Row 104: supplier credits. Zero real Xero writes; projection/link only.';
