-- Row 90 — Fixed-price / flat-rate quoting presentation
-- Additive only. Staging-safe. Backwards compatible.
-- Defaults preserve historical ITEMISED behaviour (no silent repricing).
-- Production migration = 0 from this agent run (staging only).

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS pricing_presentation_mode text NOT NULL DEFAULT 'ITEMISED';

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS labour_included boolean NOT NULL DEFAULT false;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS callout_included boolean NOT NULL DEFAULT false;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS callout_allocation text NOT NULL DEFAULT 'PER_JOB';

ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS customer_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN quotes.pricing_presentation_mode IS
  'Row 90: ITEMISED | FLAT_RATE_INCLUDED. Explicit; never inferred from descriptions.';

COMMENT ON COLUMN quotes.labour_included IS
  'Row 90: when true with FLAT_RATE_INCLUDED, labour is absorbed into customer-facing service price.';

COMMENT ON COLUMN quotes.callout_included IS
  'Row 90: when true with FLAT_RATE_INCLUDED, call-out is absorbed into customer-facing service price.';

COMMENT ON COLUMN quotes.callout_allocation IS
  'Row 90: PER_JOB | PER_UNIT — explicit call-out allocation policy.';

COMMENT ON COLUMN quote_line_items.customer_visible IS
  'Row 90: false = internal pricing component (cost/allocation retained; not customer-charged).';
