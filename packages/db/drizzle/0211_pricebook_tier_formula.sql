-- Row 92 — Configurable Young Guns Pricebook Tier Formula
-- Additive only. Staging-safe. Backwards compatible.
-- Tenant-scoped versioned rule sets. NO price backfill. NO catalogue mutation.
-- Global automation remains OFF. Activation blocked without later Owner auth.
-- Production migration = 0 from this agent run (staging only).

CREATE TABLE IF NOT EXISTS company_pricebook_rule_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'DRAFT',
  base_cost_type text NOT NULL DEFAULT 'UNKNOWN',
  currency text NOT NULL DEFAULT 'ZAR',
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  global_automation_enabled boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  activated_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_pricebook_rule_sets_status_chk
    CHECK (status IN ('DRAFT', 'INACTIVE', 'ACTIVE', 'RETIRED')),
  CONSTRAINT company_pricebook_rule_sets_version_chk
    CHECK (version >= 1),
  CONSTRAINT company_pricebook_rule_sets_currency_chk
    CHECK (currency = 'ZAR')
);

-- At most one ACTIVE rule set per company (Row 92 keeps YG DRAFT — this is forward-safe).
CREATE UNIQUE INDEX IF NOT EXISTS company_pricebook_rule_sets_one_active_uidx
  ON company_pricebook_rule_sets (company_id)
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS company_pricebook_rule_sets_company_version_uidx
  ON company_pricebook_rule_sets (company_id, version);

CREATE INDEX IF NOT EXISTS company_pricebook_rule_sets_company_status_idx
  ON company_pricebook_rule_sets (company_id, status);

COMMENT ON TABLE company_pricebook_rule_sets IS
  'Row 92: tenant-scoped versioned pricebook tier multiplier rules. Preview/config only until authorised activation.';

COMMENT ON COLUMN company_pricebook_rule_sets.tiers IS
  'JSON array of {minCentsInclusive,maxCentsInclusive,multiplierNumerator,multiplierDenominator,label}';

COMMENT ON COLUMN company_pricebook_rule_sets.global_automation_enabled IS
  'MUST remain false for Row 92. True only after later Owner-authorised activation path.';

COMMENT ON COLUMN company_pricebook_rule_sets.base_cost_type IS
  'UNIT_COST_CENTS | SUPPLIER_NET_COST | SUPPLIER_NET_DISCOUNTED | UNKNOWN — never apply formula to UNKNOWN.';

COMMENT ON COLUMN company_pricebook_rule_sets.status IS
  'DRAFT | INACTIVE | ACTIVE | RETIRED. Row 92 YG rule stays DRAFT/INACTIVE.';
