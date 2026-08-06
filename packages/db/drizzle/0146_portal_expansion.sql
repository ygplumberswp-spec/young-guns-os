-- Customer Portal Expansion (Department 7.1)
-- Extends existing customer portal with explicit customer-visible document shares.
-- Customers see only own linked data. No margins/internal notes/Xero internals.
-- No fake customers/jobs/quotes/invoices. Forward-only. Do not deploy without approval.

CREATE TABLE IF NOT EXISTS cpe_document_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  shared_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  shared_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cpe_document_shares_company_customer_doc_uidx
  ON cpe_document_shares (company_id, customer_id, document_id);

CREATE INDEX IF NOT EXISTS cpe_document_shares_company_customer_active_idx
  ON cpe_document_shares (company_id, customer_id, is_active);

CREATE INDEX IF NOT EXISTS cpe_document_shares_document_idx
  ON cpe_document_shares (document_id);
