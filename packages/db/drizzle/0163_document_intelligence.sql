-- Document Intelligence (Department 13)
-- Extends existing documents foundation with typed profiles, version history,
-- expiry reminders, and AURA recommendation drafts (expiry alerts / missing docs).
-- Real documents only. Drafts only — never auto-send / never invent documents.
-- Links customers/jobs/cx_customer_properties via real FKs.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.
-- Never touches Yoco 0123.

DO $$ BEGIN
  CREATE TYPE di_document_type AS ENUM (
    'coc', 'quote', 'invoice', 'report', 'warranty', 'certificate', 'photo', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE di_reminder_status AS ENUM (
    'open', 'acknowledged', 'dismissed', 'resolved'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE di_recommendation_kind AS ENUM (
    'expiry_alert', 'missing_doc_suggestion'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE di_recommendation_status AS ENUM (
    'draft', 'pending_approval', 'approved', 'rejected', 'cancelled', 'acknowledged'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE di_aura_insight_target AS ENUM (
    'command_centre', 'executive_dashboard', 'documents', 'customers', 'jobs', 'compliance', 'operations'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE di_aura_insight_status AS ENUM (
    'open', 'acknowledged', 'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS di_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auto_send_reminders_enabled boolean NOT NULL DEFAULT false,
  invent_documents_enabled boolean NOT NULL DEFAULT false,
  expiry_reminders_enabled boolean NOT NULL DEFAULT true,
  missing_doc_suggestions_enabled boolean NOT NULL DEFAULT true,
  reminder_lead_days integer NOT NULL DEFAULT 30,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT di_settings_no_auto_send CHECK (auto_send_reminders_enabled = false),
  CONSTRAINT di_settings_no_invent CHECK (invent_documents_enabled = false)
);

CREATE UNIQUE INDEX IF NOT EXISTS di_settings_company_uidx ON di_settings (company_id);

CREATE TABLE IF NOT EXISTS di_document_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_type di_document_type NOT NULL DEFAULT 'other',
  property_id uuid REFERENCES cx_customer_properties(id) ON DELETE SET NULL,
  expires_at timestamptz,
  current_version_number integer NOT NULL DEFAULT 1,
  notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS di_document_profiles_document_uidx
  ON di_document_profiles (company_id, document_id);

CREATE INDEX IF NOT EXISTS di_document_profiles_type_idx
  ON di_document_profiles (company_id, document_type);

CREATE INDEX IF NOT EXISTS di_document_profiles_expiry_idx
  ON di_document_profiles (company_id, expires_at);

CREATE INDEX IF NOT EXISTS di_document_profiles_property_idx
  ON di_document_profiles (company_id, property_id);

CREATE TABLE IF NOT EXISTS di_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  title text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size_bytes integer,
  change_note text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS di_document_versions_doc_version_uidx
  ON di_document_versions (company_id, document_id, version_number);

CREATE INDEX IF NOT EXISTS di_document_versions_document_idx
  ON di_document_versions (company_id, document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS di_expiry_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  status di_reminder_status NOT NULL DEFAULT 'open',
  note text NOT NULL DEFAULT '',
  acknowledged_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS di_expiry_reminders_queue_idx
  ON di_expiry_reminders (company_id, status, expires_at);

CREATE TABLE IF NOT EXISTS di_recommendation_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind di_recommendation_kind NOT NULL,
  status di_recommendation_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  property_id uuid REFERENCES cx_customer_properties(id) ON DELETE SET NULL,
  auto_executed boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT di_recommendation_drafts_no_auto CHECK (auto_executed = false)
);

CREATE INDEX IF NOT EXISTS di_recommendation_drafts_queue_idx
  ON di_recommendation_drafts (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS di_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target di_aura_insight_target NOT NULL,
  status di_aura_insight_status NOT NULL DEFAULT 'open',
  title text NOT NULL,
  insight text NOT NULL,
  href text,
  source_recommendation_id uuid REFERENCES di_recommendation_drafts(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS di_aura_insights_company_idx
  ON di_aura_insights (company_id, created_at DESC);
