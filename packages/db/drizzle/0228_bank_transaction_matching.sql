-- Row 110 — Bank transaction match candidates (suggestions only)
-- No silent match. No JPE. No Xero writes.

CREATE TABLE IF NOT EXISTS bank_transaction_match_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_transaction_id uuid NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id text NOT NULL,
  target_label text,
  confidence text NOT NULL,
  amount_cents integer NOT NULL,
  amount_difference_cents integer NOT NULL DEFAULT 0,
  reason text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  disposition text NOT NULL DEFAULT 'REVIEW_REQUIRED',
  sequence_used_as_proof boolean NOT NULL DEFAULT false,
  auto_matched boolean NOT NULL DEFAULT false,
  jpe_posted boolean NOT NULL DEFAULT false,
  xero_writes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_tx_match_target_chk CHECK (target_type IN (
    'job','supplier','receipt','expense','invoice','payment','direct_cost','other_finance'
  )),
  CONSTRAINT bank_tx_match_confidence_chk CHECK (confidence IN ('high','medium','low')),
  CONSTRAINT bank_tx_match_disposition_chk CHECK (disposition IN (
    'NO_CANDIDATES','SINGLE_CANDIDATE','REVIEW_REQUIRED','DETERMINISTIC_UNIQUE'
  )),
  CONSTRAINT bank_tx_match_safety_chk CHECK (
    sequence_used_as_proof = false
    AND auto_matched = false
    AND jpe_posted = false
    AND xero_writes = 0
  )
);

CREATE INDEX IF NOT EXISTS bank_tx_match_company_tx_idx
  ON bank_transaction_match_candidates (company_id, bank_transaction_id);
