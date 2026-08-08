-- Row 105 — Multi-job supplier invoice allocation
-- Additive over Row103/104. No Row106–107. Staging Xero writes = 0.

CREATE TABLE IF NOT EXISTS multi_job_supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_invoice_evidence_id uuid REFERENCES job_procurement_supplier_invoice_evidence(id) ON DELETE SET NULL,
  source_document_ref text,
  source_document_hash text,
  invoice_number text,
  invoice_date date,
  net_amount_cents integer,
  vat_amount_cents integer,
  vat_basis text,
  gross_amount_cents integer,
  known_xero_bill_id text,
  known_xero_invoice_id text,
  xero_link_status text NOT NULL DEFAULT 'XERO_BILL_NOT_LINKED',
  immutable_source boolean NOT NULL DEFAULT true,
  balance_status text NOT NULL DEFAULT 'UNALLOCATED',
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text,
  client_action_id text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multi_job_supplier_invoices_xero_status_chk CHECK (xero_link_status IN (
    'LINKED','XERO_BILL_NOT_LINKED'
  )),
  CONSTRAINT multi_job_supplier_invoices_balance_chk CHECK (balance_status IN (
    'ALLOCATED','PARTIALLY_ALLOCATED','UNALLOCATED','OVER_ALLOCATED',
    'REVIEW_REQUIRED','RECONCILED','INCOMPLETE'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS multi_job_supplier_invoices_company_idempotency_uidx
  ON multi_job_supplier_invoices (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS multi_job_supplier_invoices_company_idx
  ON multi_job_supplier_invoices (company_id);

CREATE TABLE IF NOT EXISTS multi_job_supplier_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES multi_job_supplier_invoices(id) ON DELETE CASCADE,
  line_order integer NOT NULL DEFAULT 1,
  item_code text,
  description text,
  quantity numeric(18,4),
  unit text,
  net_amount_cents integer,
  vat_amount_cents integer,
  vat_basis text,
  gross_amount_cents integer,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  purchase_order_line_id uuid REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS multi_job_supplier_invoice_lines_invoice_idx
  ON multi_job_supplier_invoice_lines (company_id, invoice_id);

CREATE TABLE IF NOT EXISTS multi_job_supplier_invoice_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES multi_job_supplier_invoices(id) ON DELETE CASCADE,
  invoice_line_id uuid REFERENCES multi_job_supplier_invoice_lines(id) ON DELETE SET NULL,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  purchase_order_line_id uuid REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  allocation_key text NOT NULL,
  allocation_net_cents integer NOT NULL,
  allocation_vat_cents integer,
  allocation_gross_cents integer,
  allocation_quantity numeric(18,4),
  reason text,
  review_status text NOT NULL DEFAULT 'DRAFT',
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  jpe_source_id text,
  jpe_posted boolean NOT NULL DEFAULT false,
  superseded_by_allocation_id uuid,
  correction_of_allocation_id uuid,
  idempotency_key text,
  client_action_id text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multi_job_alloc_review_chk CHECK (review_status IN (
    'DRAFT','REVIEWED','APPROVED','BLOCKED','CORRECTED','SUPERSEDED'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS multi_job_alloc_company_key_uidx
  ON multi_job_supplier_invoice_allocations (company_id, allocation_key);

CREATE UNIQUE INDEX IF NOT EXISTS multi_job_alloc_company_idempotency_uidx
  ON multi_job_supplier_invoice_allocations (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS multi_job_alloc_jpe_source_uidx
  ON multi_job_supplier_invoice_allocations (company_id, jpe_source_id)
  WHERE jpe_source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS multi_job_alloc_company_job_idx
  ON multi_job_supplier_invoice_allocations (company_id, job_id);

CREATE TABLE IF NOT EXISTS multi_job_supplier_invoice_allocation_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES multi_job_supplier_invoices(id) ON DELETE CASCADE,
  prior_allocation_id uuid NOT NULL REFERENCES multi_job_supplier_invoice_allocations(id) ON DELETE CASCADE,
  new_allocation_id uuid REFERENCES multi_job_supplier_invoice_allocations(id) ON DELETE SET NULL,
  correction_key text NOT NULL,
  reverse_amount_cents integer NOT NULL,
  reason text NOT NULL,
  preserves_history boolean NOT NULL DEFAULT true,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS multi_job_alloc_corr_key_uidx
  ON multi_job_supplier_invoice_allocation_corrections (company_id, correction_key);
