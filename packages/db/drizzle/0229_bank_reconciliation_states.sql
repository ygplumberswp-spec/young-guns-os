-- Row 111 — Reconciliation state vocabulary + human review audit
-- AURA suggests only; cannot independently reconcile uncertain money.

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS recon_state text,
  ADD COLUMN IF NOT EXISTS recon_reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recon_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS recon_review_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Soft constraint via check when set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_recon_state_chk'
  ) THEN
    ALTER TABLE bank_transactions
      ADD CONSTRAINT bank_transactions_recon_state_chk CHECK (
        recon_state IS NULL OR recon_state IN (
          'UNMATCHED','POSSIBLE_MATCH','PARTIAL','REVIEWED','RECONCILED','REVIEW_REQUIRED'
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bank_reconciliation_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_transaction_id uuid NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  previous_state text,
  state text NOT NULL,
  reviewed_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  aura_suggestion jsonb,
  human_confirmed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_recon_reviews_state_chk CHECK (state IN (
    'UNMATCHED','POSSIBLE_MATCH','PARTIAL','REVIEWED','RECONCILED','REVIEW_REQUIRED'
  )),
  CONSTRAINT bank_recon_reviews_human_chk CHECK (human_confirmed = true)
);

CREATE INDEX IF NOT EXISTS bank_recon_reviews_company_tx_idx
  ON bank_reconciliation_reviews (company_id, bank_transaction_id, reviewed_at DESC);
