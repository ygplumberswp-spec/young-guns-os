-- Row 95 — Quote Scenarios
-- Additive only. Staging-safe. Backwards compatible.
-- ONE canonical scenario registry on existing quotes — no second quote engine.
-- Historical quotes remain NULL scenario → STANDARD/legacy fallback at read time.
-- NO mass backfill / auto-classification from descriptions.
-- Row 92 automation remains OFF. Rows 96–99 not started.
-- Production migration = 0.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS scenario text,
  ADD COLUMN IF NOT EXISTS scenario_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS phase_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotes_scenario_chk'
  ) THEN
    ALTER TABLE quotes
      ADD CONSTRAINT quotes_scenario_chk
      CHECK (
        scenario IS NULL OR scenario IN (
          'STANDARD',
          'EMERGENCY',
          'FIXED_PRICE',
          'GEYSER_COMPLIANCE',
          'DRAINS_CAMERA',
          'BATHROOM',
          'CONSTRUCTION',
          'COMMERCIAL_MANAGING_AGENT',
          'MAINTENANCE_AGREEMENT',
          'MULTI_PHASE_PROJECT',
          'PLAN_ESTIMATE',
          'BOQ_TENDER',
          'DEPOSIT_PROGRESS_FINAL',
          'VARIATION'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS quotes_company_scenario_idx
  ON quotes (company_id, scenario);

CREATE TABLE IF NOT EXISTS quote_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  phase_key text NOT NULL,
  label text NOT NULL,
  sequence integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PLANNED',
  total_cents integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_phases_status_chk CHECK (status IN (
    'PLANNED','IN_PROGRESS','COMPLETE','ON_HOLD','CANCELLED'
  )),
  CONSTRAINT quote_phases_quote_key_uidx UNIQUE (quote_id, phase_key)
);

CREATE INDEX IF NOT EXISTS quote_phases_company_quote_idx
  ON quote_phases (company_id, quote_id);

CREATE TABLE IF NOT EXISTS quote_commercial_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  sequence integer NOT NULL DEFAULT 0,
  percent_bps integer,
  amount_cents integer,
  notes text,
  -- Commercial definition only — NEVER payment truth.
  is_payment boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_milestones_kind_chk CHECK (kind IN (
    'DEPOSIT','PROGRESS','FINAL','OTHER'
  )),
  CONSTRAINT quote_milestones_not_payment_chk CHECK (is_payment = false)
);

CREATE INDEX IF NOT EXISTS quote_milestones_company_quote_idx
  ON quote_commercial_milestones (company_id, quote_id);

CREATE TABLE IF NOT EXISTS quote_scenario_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  previous_scenario text,
  next_scenario text NOT NULL,
  previous_metadata jsonb,
  next_metadata jsonb,
  client_action_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quote_scenario_audit_company_quote_idx
  ON quote_scenario_audit_events (company_id, quote_id, created_at DESC);

-- Variation parent linkage (optional explicit columns; metadata remains source for validation).
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS variation_parent_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quotes_variation_parent_idx
  ON quotes (company_id, variation_parent_quote_id)
  WHERE variation_parent_quote_id IS NOT NULL;
