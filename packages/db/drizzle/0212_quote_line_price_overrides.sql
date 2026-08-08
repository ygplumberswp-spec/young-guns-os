-- Row 93 — One-off Owner-approved quote line price overrides
-- Additive only. Staging-safe. Backwards compatible.
-- Quote-specific only. Does NOT mutate company_pricebook_rule_sets / catalogue.
-- No historical backfill. Production migration = 0 from this agent run.

CREATE TABLE IF NOT EXISTS quote_line_price_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'DRAFT_PROPOSAL',
  reason text NOT NULL,
  preview_hash text NOT NULL,
  quote_updated_at timestamptz NOT NULL,
  line_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  baseline_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposed_sell_by_line_id jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_total_cents integer NOT NULL,
  after_total_cents integer NOT NULL,
  price_rule_set_id text,
  price_rule_version integer,
  proposed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  executed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  executed_at timestamptz,
  rejected_by uuid REFERENCES users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_line_price_overrides_status_chk
    CHECK (status IN (
      'DRAFT_PROPOSAL',
      'OWNER_APPROVED',
      'EXECUTED',
      'REJECTED',
      'CANCELLED',
      'STALE'
    )),
  CONSTRAINT quote_line_price_overrides_reason_chk
    CHECK (char_length(btrim(reason)) > 0)
);

CREATE INDEX IF NOT EXISTS quote_line_price_overrides_company_quote_idx
  ON quote_line_price_overrides (company_id, quote_id);

CREATE INDEX IF NOT EXISTS quote_line_price_overrides_company_status_idx
  ON quote_line_price_overrides (company_id, status);

-- At most one open (non-terminal) override proposal per quote.
CREATE UNIQUE INDEX IF NOT EXISTS quote_line_price_overrides_one_open_uidx
  ON quote_line_price_overrides (company_id, quote_id)
  WHERE status IN ('DRAFT_PROPOSAL', 'OWNER_APPROVED');

COMMENT ON TABLE quote_line_price_overrides IS
  'Row 93: quote-specific one-off sell price overrides. Never mutates global pricebook / Row 92 rules.';

COMMENT ON COLUMN quote_line_price_overrides.preview_hash IS
  'Stale-approval guard — must match quote_updated_at + proposed amounts at execute.';

COMMENT ON COLUMN quote_line_price_overrides.baseline_snapshot IS
  'Preserved baseline sell prices / sources before override execution.';
