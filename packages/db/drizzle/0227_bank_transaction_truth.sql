-- Row 109 — Canonical bank transaction truth provenance hardening
-- Additive only. Never invent balances. No Row114+.

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS source_file_hash text,
  ADD COLUMN IF NOT EXISTS masked_account_identity text,
  ADD COLUMN IF NOT EXISTS signed_amount_cents integer;

COMMENT ON COLUMN bank_transactions.signed_amount_cents IS
  'Exact signed amount (credit +, debit -). Derived from source; never fabricated.';
COMMENT ON COLUMN bank_transactions.source_file_hash IS
  'SHA-256 of original statement/source file when imported.';
COMMENT ON COLUMN bank_transactions.masked_account_identity IS
  'Masked account identity only — never full credentials.';

-- Backfill signed amounts from existing absolute + direction (no invention).
UPDATE bank_transactions
SET signed_amount_cents = CASE
  WHEN direction = 'debit' THEN -ABS(amount_cents)
  ELSE ABS(amount_cents)
END
WHERE signed_amount_cents IS NULL;
