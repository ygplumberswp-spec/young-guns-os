-- Row 113 — Economic event identity for exactly-once finance/JPE feed
-- No automatic Xero/provider accounting writes.

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS economic_event_key text,
  ADD COLUMN IF NOT EXISTS finance_feed_status text NOT NULL DEFAULT 'not_eligible',
  ADD COLUMN IF NOT EXISTS jpe_feed_status text NOT NULL DEFAULT 'not_eligible';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_finance_feed_chk'
  ) THEN
    ALTER TABLE bank_transactions
      ADD CONSTRAINT bank_transactions_finance_feed_chk CHECK (
        finance_feed_status IN ('not_eligible','eligible','fed','skipped_duplicate')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_jpe_feed_chk'
  ) THEN
    ALTER TABLE bank_transactions
      ADD CONSTRAINT bank_transactions_jpe_feed_chk CHECK (
        jpe_feed_status IN ('not_eligible','eligible','fed','skipped_duplicate')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bank_transactions_company_economic_key_idx
  ON bank_transactions (company_id, economic_event_key)
  WHERE economic_event_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS bank_economic_event_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  economic_event_key text NOT NULL,
  fed_from_transaction_id uuid NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  feed_target text NOT NULL,
  skipped_duplicate_transaction_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  xero_writes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_econ_feed_target_chk CHECK (feed_target IN ('finance','jpe')),
  CONSTRAINT bank_econ_feed_xero_chk CHECK (xero_writes = 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_econ_feed_company_key_target_uidx
  ON bank_economic_event_feeds (company_id, economic_event_key, feed_target);
