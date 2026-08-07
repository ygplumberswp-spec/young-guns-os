-- BANK-001A — Transaction ledger financial integrity hardening

-- Account-scoped dedupe (defense in depth; fingerprint canonical already embeds account id)
DROP INDEX IF EXISTS bank_transactions_company_fingerprint_unique;
DROP INDEX IF EXISTS bank_transactions_company_provider_external_unique;

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_company_account_fingerprint_unique
  ON bank_transactions (company_id, bank_account_id, source_fingerprint);

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_company_account_provider_external_unique
  ON bank_transactions (company_id, bank_account_id, provider, external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;

-- Partial cash settlement against direct costs (bank allocation ledger is authoritative)
ALTER TABLE job_direct_cost_entries
  ADD COLUMN IF NOT EXISTS amount_paid_cents integer NOT NULL DEFAULT 0;

-- Allocation write idempotency (browser retries / double-click)
ALTER TABLE bank_transaction_allocations
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS bank_transaction_allocations_idempotency_unique
  ON bank_transaction_allocations (company_id, transaction_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Cent-exact allocation ceiling
DO $$ BEGIN
  ALTER TABLE bank_transactions
    ADD CONSTRAINT bank_transactions_allocated_not_exceed_amount
    CHECK (allocated_amount_cents >= 0 AND allocated_amount_cents <= amount_cents);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill: legacy fully-paid rows without explicit amount_paid_cents
UPDATE job_direct_cost_entries
SET amount_paid_cents = amount_cents
WHERE is_paid = true AND amount_paid_cents = 0;
