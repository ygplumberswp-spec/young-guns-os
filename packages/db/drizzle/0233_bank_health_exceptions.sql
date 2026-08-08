-- Row 115 — Bank health snapshot cache (truthful; no fabricated balances)

CREATE TABLE IF NOT EXISTS bank_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  operating_mode text NOT NULL,
  connection_import_status text NOT NULL,
  last_successful_intake_at timestamptz,
  last_attempted_intake_at timestamptz,
  statement_batch_count integer NOT NULL DEFAULT 0,
  unmatched_count integer NOT NULL DEFAULT 0,
  possible_match_count integer NOT NULL DEFAULT 0,
  review_required_count integer NOT NULL DEFAULT 0,
  partially_reconciled_count integer NOT NULL DEFAULT 0,
  provider_import_error_count integer NOT NULL DEFAULT 0,
  stale_intake boolean NOT NULL DEFAULT false,
  stale_intake_warning text,
  bank_balance_cents integer,
  balance_fabricated boolean NOT NULL DEFAULT false,
  connected_claim boolean NOT NULL DEFAULT false,
  fabricated_health boolean NOT NULL DEFAULT false,
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_health_no_fabricate_chk CHECK (
    balance_fabricated = false AND fabricated_health = false
  )
);

CREATE INDEX IF NOT EXISTS bank_health_snapshots_company_idx
  ON bank_health_snapshots (company_id, captured_at DESC);
