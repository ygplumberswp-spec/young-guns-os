-- Row 96 — Canonical Quote Cost Model
-- Additive only. Staging-safe. Backwards compatible.
-- Internal estimated cost ≠ customer sell. No historical backfill. No repricing.
-- Production migration = 0.

CREATE TABLE IF NOT EXISTS quote_cost_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  quote_line_id uuid REFERENCES quote_line_items(id) ON DELETE SET NULL,
  component_type text NOT NULL,
  description text NOT NULL,
  quantity numeric(18,4) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'each',
  unit_cost_cents integer,
  total_cost_cents integer,
  vat_basis text NOT NULL DEFAULT 'UNKNOWN',
  provenance text NOT NULL DEFAULT 'COST_SOURCE_MISSING',
  confidence text NOT NULL DEFAULT 'INSUFFICIENT_INFORMATION',
  customer_visible boolean NOT NULL DEFAULT false,
  option_tier text,
  wastage_percent_bps integer,
  percent_of_base_bps integer,
  percent_base text,
  source_ref text,
  catalogue_item_id uuid,
  plan_estimate_cost_component_id uuid,
  client_action_id text,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_cost_components_type_chk CHECK (component_type IN (
    'MATERIAL','LABOUR','WASTAGE','TRAVEL','CALL_OUT','EQUIPMENT',
    'SUBCONTRACTOR','PRELIMINARY','OVERHEAD','CONTINGENCY','WARRANTY','OTHER_APPROVED'
  )),
  CONSTRAINT quote_cost_components_vat_chk CHECK (vat_basis IN (
    'VAT_EXCLUSIVE','VAT_INCLUSIVE','UNKNOWN'
  )),
  CONSTRAINT quote_cost_components_prov_chk CHECK (provenance IN (
    'SUPPLIER_NET_DISCOUNTED','SUPPLIER_QUOTE','CATALOGUE_COST','INVENTORY_COST',
    'APPROVED_MANUAL_COST','PLAN_ESTIMATE','LABOUR_RATE_CONFIG','SUBCONTRACTOR_QUOTE',
    'HISTORICAL_VERIFIED','UNKNOWN','COST_SOURCE_MISSING','COST_REVIEW_REQUIRED'
  )),
  CONSTRAINT quote_cost_components_conf_chk CHECK (confidence IN (
    'COMPLETE','PARTIAL','REVIEW_REQUIRED','INSUFFICIENT_INFORMATION'
  )),
  CONSTRAINT quote_cost_components_customer_visible_chk CHECK (customer_visible = false),
  CONSTRAINT quote_cost_components_percent_base_chk CHECK (
    percent_base IS NULL OR percent_base IN ('DIRECT_COST','MATERIALS','LABOUR')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS quote_cost_components_company_client_action_uidx
  ON quote_cost_components (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS quote_cost_components_plan_import_uidx
  ON quote_cost_components (company_id, quote_id, plan_estimate_cost_component_id)
  WHERE plan_estimate_cost_component_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS quote_cost_components_quote_idx
  ON quote_cost_components (company_id, quote_id);

CREATE INDEX IF NOT EXISTS quote_cost_components_type_idx
  ON quote_cost_components (company_id, quote_id, component_type);

CREATE TABLE IF NOT EXISTS quote_cost_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  snapshot_version integer NOT NULL DEFAULT 1,
  lifecycle_status text NOT NULL,
  sell_ex_vat_cents integer,
  total_estimated_cost_cents integer,
  estimated_gross_profit_cents integer,
  confidence text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_action_id text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_cost_snapshots_version_chk CHECK (snapshot_version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS quote_cost_snapshots_company_client_action_uidx
  ON quote_cost_snapshots (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS quote_cost_snapshots_quote_version_uidx
  ON quote_cost_snapshots (company_id, quote_id, snapshot_version);

CREATE INDEX IF NOT EXISTS quote_cost_snapshots_quote_idx
  ON quote_cost_snapshots (company_id, quote_id);

CREATE TABLE IF NOT EXISTS quote_cost_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  warning_code text NOT NULL,
  severity text NOT NULL DEFAULT 'WARNING',
  message text NOT NULL,
  component_id uuid REFERENCES quote_cost_components(id) ON DELETE SET NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_cost_warnings_severity_chk CHECK (severity IN ('INFO','WARNING','BLOCKING'))
);

CREATE INDEX IF NOT EXISTS quote_cost_warnings_quote_idx
  ON quote_cost_warnings (company_id, quote_id, resolved);

CREATE TABLE IF NOT EXISTS quote_cost_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  component_id uuid,
  event_type text NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  before_json jsonb,
  after_json jsonb,
  provenance text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_cost_audit_events_type_chk CHECK (event_type IN (
    'quote_cost_component_added',
    'quote_cost_component_changed',
    'quote_cost_component_removed',
    'quote_cost_baseline_snapshotted',
    'quote_scope_changed',
    'quote_exclusion_changed',
    'quote_assumption_changed',
    'quote_cost_warning_resolved',
    'quote_cost_plan_imported'
  ))
);

CREATE INDEX IF NOT EXISTS quote_cost_audit_events_quote_idx
  ON quote_cost_audit_events (company_id, quote_id, created_at DESC);

COMMENT ON TABLE quote_cost_components IS
  'Row 96: internal quote cost components. Never customer-visible. Not a second quote engine.';

COMMENT ON COLUMN quote_cost_components.customer_visible IS
  'Always false — cost components must never appear as customer charges.';
