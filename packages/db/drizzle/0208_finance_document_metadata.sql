-- Row 89 — Quote/Invoice payment terms, PO/reference, internal + customer-facing notes
-- Additive only. Staging-safe. No destructive rename/drop.
-- Separates invoice customer PO + internal notes from overloaded xero_reference.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS customer_po_number text;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS internal_notes text;

COMMENT ON COLUMN invoices.customer_po_number IS
  'Customer PO number (TITAN-owned). Never fabricate. Distinct from xero_reference.';

COMMENT ON COLUMN invoices.internal_notes IS
  'Staff-only internal notes. Must never appear on portal/PDF/print/customer comms.';

COMMENT ON COLUMN invoices.notes IS
  'Customer-facing notes (explicitly visible on invoice PDF/portal when authorised).';

COMMENT ON COLUMN invoices.payment_terms IS
  'Payment terms metadata text. Not payment/ledger state.';

COMMENT ON COLUMN invoices.xero_reference IS
  'Provider/Xero Reference (provider-authoritative when Xero-backed).';

COMMENT ON COLUMN quotes.customer_notes IS
  'Customer PO / customer reference (combined field — UI labels distinguish).';

COMMENT ON COLUMN quotes.internal_notes IS
  'Staff-only internal notes. Must never appear on portal/PDF/print/customer comms.';

COMMENT ON COLUMN quotes.notes IS
  'Customer-facing notes (message to customer).';

COMMENT ON COLUMN quotes.payment_terms IS
  'Payment terms metadata text. Not payment/ledger state.';
