-- Row 94 — Plan / Floor-Plan Quotation & Estimate Baseline
-- Additive only. Staging-safe. Backwards compatible.
-- Manual/structured take-off only. NOT AI (Row 98). NOT full cost engine (Row 96).
-- No historical quote mutation. No fake backfill. Production migration = 0.

CREATE TABLE IF NOT EXISTS plan_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  property_id uuid,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  source_document_id uuid,
  source_filename text,
  source_file_hash text,
  source_revision_label text,
  source_uploaded_at timestamptz,
  estimate_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'DRAFT_TAKEOFF',
  scale_status text NOT NULL DEFAULT 'SCALE_NOT_PROVIDED',
  scale_provenance text,
  currency text NOT NULL DEFAULT 'ZAR',
  proposed_sell_ex_vat_cents integer,
  sell_source text NOT NULL DEFAULT 'MISSING',
  client_action_id text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  approved_at timestamptz,
  superseded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_estimates_status_chk CHECK (status IN (
    'DRAFT_TAKEOFF','REVIEW_REQUIRED','REVIEWED','APPROVED_FOR_QUOTE','SUPERSEDED'
  )),
  CONSTRAINT plan_estimates_scale_chk CHECK (scale_status IN (
    'SCALE_VERIFIED','SCALE_NOT_PROVIDED','MEASUREMENT_REVIEW_REQUIRED'
  )),
  CONSTRAINT plan_estimates_version_chk CHECK (estimate_version >= 1),
  CONSTRAINT plan_estimates_currency_chk CHECK (currency = 'ZAR')
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_estimates_company_client_action_uidx
  ON plan_estimates (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS plan_estimates_company_status_idx
  ON plan_estimates (company_id, status);

CREATE INDEX IF NOT EXISTS plan_estimates_company_customer_idx
  ON plan_estimates (company_id, customer_id);

CREATE INDEX IF NOT EXISTS plan_estimates_company_quote_idx
  ON plan_estimates (company_id, quote_id);

CREATE TABLE IF NOT EXISTS plan_estimate_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  estimate_id uuid NOT NULL REFERENCES plan_estimates(id) ON DELETE CASCADE,
  point_type text NOT NULL,
  subtype_label text,
  description text NOT NULL,
  quantity numeric(18,4) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'each',
  quantity_origin text NOT NULL,
  page_reference text,
  plan_annotation_ref text,
  confidence text NOT NULL DEFAULT 'CONFIRMED',
  customer_visible_scope_text text,
  entered_by uuid REFERENCES users(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_estimate_items_point_type_chk CHECK (point_type IN (
    'WATER','WASTE','GEYSER','OTHER'
  )),
  CONSTRAINT plan_estimate_items_origin_chk CHECK (quantity_origin IN (
    'MANUAL_COUNT','PLAN_ANNOTATION','EXPLICIT_PLAN_LABEL','MEASURED','IMPORTED_STRUCTURED_SOURCE'
  )),
  CONSTRAINT plan_estimate_items_confidence_chk CHECK (confidence IN (
    'CONFIRMED','REVIEW_REQUIRED','INSUFFICIENT_INFORMATION'
  ))
);

CREATE INDEX IF NOT EXISTS plan_estimate_items_estimate_idx
  ON plan_estimate_items (company_id, estimate_id);

CREATE TABLE IF NOT EXISTS plan_estimate_cost_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  estimate_id uuid NOT NULL REFERENCES plan_estimates(id) ON DELETE CASCADE,
  estimate_item_id uuid REFERENCES plan_estimate_items(id) ON DELETE SET NULL,
  component_type text NOT NULL,
  description text NOT NULL,
  quantity numeric(18,4) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'each',
  unit_cost_cents integer,
  cost_provenance text NOT NULL DEFAULT 'MISSING',
  catalogue_item_id uuid,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_estimate_cost_components_type_chk CHECK (component_type IN (
    'MATERIAL','LABOUR','SITE','OTHER'
  )),
  CONSTRAINT plan_estimate_cost_components_prov_chk CHECK (cost_provenance IN (
    'SUPPLIER_QUOTE','CATALOGUE_COST','APPROVED_MANUAL_COST','HISTORICAL_VERIFIED','MISSING'
  ))
);

CREATE INDEX IF NOT EXISTS plan_estimate_cost_components_estimate_idx
  ON plan_estimate_cost_components (company_id, estimate_id);

COMMENT ON TABLE plan_estimates IS
  'Row 94: plan/floor-plan estimate baseline. Manual take-off only — not AI Row 98.';

COMMENT ON COLUMN plan_estimates.scale_status IS
  'SCALE_VERIFIED | SCALE_NOT_PROVIDED | MEASUREMENT_REVIEW_REQUIRED — never invent metres.';

COMMENT ON TABLE plan_estimate_items IS
  'Row 94: water/waste/geyser/other take-off points with quantity provenance.';

COMMENT ON TABLE plan_estimate_cost_components IS
  'Row 94: material/labour/site estimated costs with provenance. Missing stays missing.';
