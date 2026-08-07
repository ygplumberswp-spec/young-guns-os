-- Department 19: Industry Templates.
-- Tenant-scoped trade configuration for the one shared TITAN core. Templates
-- hold structure and terminology, never business records, and every change
-- lands as a new append-only version.
-- The itpl_ prefix is distinct from the existing ip_ industry pack tables.

DO $$ BEGIN
  CREATE TYPE itpl_trade AS ENUM (
    'plumbing',
    'electrical',
    'hvac',
    'construction',
    'other_trade'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE itpl_support_level AS ENUM (
    'supported',
    'requires_configuration',
    'requires_compliance_review',
    'unavailable'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE itpl_template_status AS ENUM ('draft', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE itpl_version_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE itpl_change_impact AS ENUM ('live_workflow', 'presentation_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE itpl_event_kind AS ENUM (
    'template_created',
    'version_saved',
    'version_submitted',
    'version_decided',
    'template_activated',
    'template_archived',
    'settings_updated',
    'access_denied'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS itpl_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  require_approval_for_live_changes boolean NOT NULL DEFAULT true,
  allow_unreviewed_compliance_claims boolean NOT NULL DEFAULT false,
  seed_tenant_records boolean NOT NULL DEFAULT false,
  technician_read_enabled boolean NOT NULL DEFAULT true,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A live-workflow change always needs Owner approval.
  CONSTRAINT itpl_settings_approval_ck CHECK (require_approval_for_live_changes = true),
  -- TITAN never asserts a compliance standard on a trade's behalf.
  CONSTRAINT itpl_settings_compliance_ck CHECK (allow_unreviewed_compliance_claims = false),
  -- Creating or activating a template never writes records into a tenant.
  CONSTRAINT itpl_settings_no_seeding_ck CHECK (seed_tenant_records = false)
);

CREATE UNIQUE INDEX IF NOT EXISTS itpl_settings_company_uidx ON itpl_settings (company_id);

CREATE TABLE IF NOT EXISTS itpl_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  name text NOT NULL,
  trade itpl_trade NOT NULL,
  custom_trade_label text,
  status itpl_template_status NOT NULL DEFAULT 'draft',
  support itpl_support_level NOT NULL DEFAULT 'requires_configuration',
  is_active boolean NOT NULL DEFAULT false,
  active_version_id uuid,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT itpl_templates_key_ck CHECK (length(template_key) > 0),
  CONSTRAINT itpl_templates_name_ck CHECK (length(name) > 0),
  -- A template can only be active once a version has actually gone live.
  CONSTRAINT itpl_templates_active_ck CHECK (
    (is_active = false) OR (active_version_id IS NOT NULL AND status = 'active')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS itpl_templates_company_key_uidx
  ON itpl_templates (company_id, template_key);
-- Exactly one template may be the active configuration for a company.
CREATE UNIQUE INDEX IF NOT EXISTS itpl_templates_company_active_uidx
  ON itpl_templates (company_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS itpl_templates_company_trade_idx
  ON itpl_templates (company_id, trade);

CREATE TABLE IF NOT EXISTS itpl_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES itpl_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  status itpl_version_status NOT NULL DEFAULT 'draft',
  change_impact itpl_change_impact NOT NULL DEFAULT 'live_workflow',
  change_summary text NOT NULL,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  support itpl_support_level NOT NULL DEFAULT 'requires_configuration',
  authored_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT itpl_versions_number_ck CHECK (version_number > 0),
  CONSTRAINT itpl_versions_summary_ck CHECK (length(change_summary) > 0),
  -- An approved or rejected version must record who decided it and when.
  CONSTRAINT itpl_versions_decided_ck CHECK (
    (status IN ('draft', 'pending_approval') AND approved_at IS NULL)
    OR (status IN ('approved', 'rejected') AND approved_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS itpl_versions_template_number_uidx
  ON itpl_template_versions (template_id, version_number);
CREATE INDEX IF NOT EXISTS itpl_versions_company_status_idx
  ON itpl_template_versions (company_id, status);

CREATE TABLE IF NOT EXISTS itpl_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES itpl_templates(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES itpl_template_versions(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  activated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  note text,
  activated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT itpl_activations_number_ck CHECK (version_number > 0)
);

CREATE INDEX IF NOT EXISTS itpl_activations_company_activated_idx
  ON itpl_activations (company_id, activated_at DESC);
CREATE INDEX IF NOT EXISTS itpl_activations_template_idx
  ON itpl_activations (template_id, activated_at DESC);

CREATE TABLE IF NOT EXISTS itpl_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_kind itpl_event_kind NOT NULL,
  template_id uuid REFERENCES itpl_templates(id) ON DELETE SET NULL,
  subject_key text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS itpl_audit_events_company_occurred_idx
  ON itpl_audit_events (company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS itpl_audit_events_company_kind_idx
  ON itpl_audit_events (company_id, event_kind);
