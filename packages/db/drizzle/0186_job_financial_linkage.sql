-- JPE-003: Job ↔ quote ↔ invoice linkage control audit trail

CREATE TYPE job_financial_linkage_entity_type AS ENUM ('quote', 'invoice');

CREATE TYPE job_financial_linkage_mechanism AS ENUM (
  'native',
  'deterministic_reference',
  'deterministic_quote',
  'manual_owner',
  'manual_finance',
  'corrected',
  'unlinked',
  'rejected'
);

CREATE TABLE IF NOT EXISTS job_financial_linkage_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type job_financial_linkage_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  previous_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  new_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  mechanism job_financial_linkage_mechanism NOT NULL,
  confidence text,
  score integer,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL,
  entity_fingerprint text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_financial_linkage_audits_company_entity_idx
  ON job_financial_linkage_audits (company_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS job_financial_linkage_audits_company_created_idx
  ON job_financial_linkage_audits (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS job_financial_linkage_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type job_financial_linkage_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  rejected_job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  reason text NOT NULL,
  rejected_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, entity_type, entity_id, rejected_job_id)
);

CREATE INDEX IF NOT EXISTS job_financial_linkage_rejections_company_entity_idx
  ON job_financial_linkage_rejections (company_id, entity_type, entity_id);
