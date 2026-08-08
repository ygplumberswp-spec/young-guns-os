-- Row 98 — AI Plan Take-Off (DRAFT proposals)
-- Additive only. Staging-safe. Does not mutate quotes, activate Row 92, or invent costs.
-- AI drafts never auto-approve into quote generation.

CREATE TABLE IF NOT EXISTS plan_estimate_ai_takeoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  estimate_id uuid NOT NULL REFERENCES plan_estimates(id) ON DELETE CASCADE,
  source_document_id uuid,
  source_revision_label text,
  scale_status text NOT NULL DEFAULT 'SCALE_NOT_PROVIDED',
  scale_provenance text,
  status text NOT NULL DEFAULT 'READY_FOR_REVIEW',
  provider_path text NOT NULL DEFAULT 'AURA_STRUCTURED_EVIDENCE_CANDIDATES',
  idempotency_key text,
  human_review_required boolean NOT NULL DEFAULT true,
  human_review_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ambiguity_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  aura_narrative_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_estimate_ai_takeoffs_status_chk CHECK (status IN (
    'READY_FOR_REVIEW',
    'NO_AUTHORISED_PLAN_SOURCE_AVAILABLE',
    'SOURCE_EVIDENCE_INSUFFICIENT',
    'EMPTY_DRAFT'
  )),
  CONSTRAINT plan_estimate_ai_takeoffs_provider_chk CHECK (
    provider_path = 'AURA_STRUCTURED_EVIDENCE_CANDIDATES'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_estimate_ai_takeoffs_idempotency_uidx
  ON plan_estimate_ai_takeoffs (company_id, estimate_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS plan_estimate_ai_takeoffs_estimate_idx
  ON plan_estimate_ai_takeoffs (company_id, estimate_id);

CREATE TABLE IF NOT EXISTS plan_estimate_ai_takeoff_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  takeoff_id uuid NOT NULL REFERENCES plan_estimate_ai_takeoffs(id) ON DELETE CASCADE,
  estimate_id uuid NOT NULL REFERENCES plan_estimates(id) ON DELETE CASCADE,
  client_key text NOT NULL,
  point_type text NOT NULL,
  subtype_label text,
  description text NOT NULL,
  quantity numeric(18,4),
  unit text NOT NULL DEFAULT 'each',
  is_length_measurement boolean NOT NULL DEFAULT false,
  quantity_origin text NOT NULL,
  page_reference text,
  annotation_ref text,
  supporting_text text,
  lifecycle text NOT NULL DEFAULT 'AI_DRAFT',
  row94_confidence text NOT NULL DEFAULT 'REVIEW_REQUIRED',
  provider_confidence text NOT NULL DEFAULT 'NONE',
  ambiguity_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  measurement_allowed boolean NOT NULL DEFAULT true,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  blocked_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  human_confirmed boolean NOT NULL DEFAULT false,
  enters_canonical_estimate boolean NOT NULL DEFAULT false,
  canonical_item_id uuid REFERENCES plan_estimate_items(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_estimate_ai_takeoff_items_point_chk CHECK (point_type IN (
    'WATER','WASTE','GEYSER','OTHER'
  )),
  CONSTRAINT plan_estimate_ai_takeoff_items_lifecycle_chk CHECK (lifecycle IN (
    'AI_DRAFT','REVIEW_REQUIRED','HUMAN_CONFIRMED','REJECTED'
  )),
  CONSTRAINT plan_estimate_ai_takeoff_items_confidence_chk CHECK (row94_confidence IN (
    'CONFIRMED','REVIEW_REQUIRED','INSUFFICIENT_INFORMATION'
  ))
);

CREATE INDEX IF NOT EXISTS plan_estimate_ai_takeoff_items_takeoff_idx
  ON plan_estimate_ai_takeoff_items (company_id, takeoff_id);

CREATE INDEX IF NOT EXISTS plan_estimate_ai_takeoff_items_estimate_idx
  ON plan_estimate_ai_takeoff_items (company_id, estimate_id);

COMMENT ON TABLE plan_estimate_ai_takeoffs IS
  'Row 98: AI DRAFT plan take-off runs. Never auto-approve; never invent costs.';

COMMENT ON TABLE plan_estimate_ai_takeoff_items IS
  'Row 98: AI DRAFT take-off items with evidence/ambiguity. Accept merges into plan_estimate_items.';
