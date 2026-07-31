-- UX-H / UX-026: ACCREC buyer classification, contact quality, marketing consent,
-- reactivation eligibility, audience requests (never sent), Xero sync-back boundary.
-- Forward-only. Disposable / staging only — never apply to live from this change set.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS is_supplier_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE TYPE buyer_classification AS ENUM (
    'contact_record',
    'accrec_buyer',
    'paid_buyer',
    'repeat_buyer',
    'inactive_reactivation_candidate',
    'supplier_only',
    'prospect_lead',
    'uncertain_manual_review'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE contact_field_key AS ENUM ('name', 'contact_person', 'email', 'phone');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE contact_verification_state AS ENUM (
    'unknown',
    'unverified',
    'verified',
    'placeholder',
    'bounced'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE marketing_consent_channel AS ENUM ('whatsapp', 'email', 'sms', 'phone');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE marketing_consent_status AS ENUM (
    'unknown',
    'granted',
    'denied',
    'withdrawn',
    'do_not_contact'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE reactivation_eligibility_status AS ENUM (
    'eligible',
    'excluded',
    'blocked',
    'awaiting_verification'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE marketing_audience_request_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE xero_sync_back_request_status AS ENUM (
    'requested',
    'approved_pending_provider',
    'cancelled',
    'blocked_no_provider'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS customer_buyer_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  primary_classification buyer_classification NOT NULL DEFAULT 'contact_record',
  is_accrec_buyer boolean NOT NULL DEFAULT false,
  is_paid_buyer boolean NOT NULL DEFAULT false,
  is_repeat_buyer boolean NOT NULL DEFAULT false,
  is_supplier_only boolean NOT NULL DEFAULT false,
  qualifying_invoice_count integer NOT NULL DEFAULT 0,
  paid_invoice_count integer NOT NULL DEFAULT 0,
  last_paid_at timestamptz,
  last_qualifying_at timestamptz,
  xero_contact_id text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL DEFAULT '',
  computed_at timestamptz NOT NULL DEFAULT now(),
  client_action_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_buyer_classifications_company_customer_uidx
  ON customer_buyer_classifications (company_id, customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS customer_buyer_classifications_company_client_action_uidx
  ON customer_buyer_classifications (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS customer_contact_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  field_key contact_field_key NOT NULL,
  value text,
  source text NOT NULL DEFAULT 'unknown',
  verification_state contact_verification_state NOT NULL DEFAULT 'unknown',
  is_shared_company_email boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_contact_fields_company_customer_field_uidx
  ON customer_contact_fields (company_id, customer_id, field_key);

CREATE TABLE IF NOT EXISTS customer_contact_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  field_key contact_field_key NOT NULL,
  old_value text,
  new_value text,
  reason text NOT NULL DEFAULT '',
  changed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_contact_corrections_customer_idx
  ON customer_contact_corrections (company_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_marketing_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel marketing_consent_channel NOT NULL,
  status marketing_consent_status NOT NULL DEFAULT 'unknown',
  lawful_basis text,
  capture_source text,
  wording_version text,
  captured_at timestamptz,
  captured_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  withdrawn_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_marketing_consents_company_customer_channel_uidx
  ON customer_marketing_consents (company_id, customer_id, channel);

CREATE TABLE IF NOT EXISTS customer_marketing_consent_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel marketing_consent_channel NOT NULL,
  previous_status marketing_consent_status,
  new_status marketing_consent_status NOT NULL,
  reason text NOT NULL DEFAULT '',
  changed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_marketing_consent_audits_customer_idx
  ON customer_marketing_consent_audits (company_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS marketing_reactivation_eligibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  eligibility_status reactivation_eligibility_status NOT NULL DEFAULT 'excluded',
  preferred_channel marketing_consent_channel,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_reactivation_eligibility_company_customer_uidx
  ON marketing_reactivation_eligibility (company_id, customer_id);

CREATE INDEX IF NOT EXISTS marketing_reactivation_eligibility_status_idx
  ON marketing_reactivation_eligibility (company_id, eligibility_status);

CREATE TABLE IF NOT EXISTS marketing_audience_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  exclusions jsonb NOT NULL DEFAULT '{}'::jsonb,
  member_customer_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  member_count integer NOT NULL DEFAULT 0,
  status marketing_audience_request_status NOT NULL DEFAULT 'draft',
  delivery_state text NOT NULL DEFAULT 'not_sent',
  requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejection_reason text,
  notes text,
  client_action_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_audience_requests_company_client_action_uidx
  ON marketing_audience_requests (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketing_audience_requests_company_status_idx
  ON marketing_audience_requests (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS xero_contact_sync_back_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  requested_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  status xero_sync_back_request_status NOT NULL DEFAULT 'requested',
  requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  client_action_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS xero_contact_sync_back_requests_company_client_action_uidx
  ON xero_contact_sync_back_requests (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;
