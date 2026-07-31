-- UX-D: Lead intake, lifecycle, conversion links, booking→dispatch handoff
-- Forward-only. Disposable / staging only — never apply to live from this change set.

ALTER TYPE "lead_status" ADD VALUE IF NOT EXISTS 'attempted_contact';
ALTER TYPE "lead_status" ADD VALUE IF NOT EXISTS 'awaiting_information';
ALTER TYPE "lead_status" ADD VALUE IF NOT EXISTS 'quote_required';
ALTER TYPE "lead_status" ADD VALUE IF NOT EXISTS 'ready_to_book';
ALTER TYPE "lead_status" ADD VALUE IF NOT EXISTS 'duplicate';

ALTER TYPE "lead_activity_type" ADD VALUE IF NOT EXISTS 'status_change';
ALTER TYPE "lead_activity_type" ADD VALUE IF NOT EXISTS 'conversion';
ALTER TYPE "lead_activity_type" ADD VALUE IF NOT EXISTS 'duplicate_override';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS suburb text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS access_instructions text,
  ADD COLUMN IF NOT EXISTS preferred_appointment_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS lost_reason text,
  ADD COLUMN IF NOT EXISTS reopen_reason text,
  ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS operational_contact_permission boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES cx_customer_properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_phone_e164 text;

CREATE INDEX IF NOT EXISTS leads_company_status_idx ON leads (company_id, status);
CREATE INDEX IF NOT EXISTS leads_company_phone_e164_idx ON leads (company_id, contact_phone_e164);
CREATE INDEX IF NOT EXISTS leads_company_email_idx ON leads (company_id, contact_email);
CREATE INDEX IF NOT EXISTS leads_company_suburb_idx ON leads (company_id, suburb);
CREATE INDEX IF NOT EXISTS leads_company_next_action_due_idx ON leads (company_id, next_action_due_at);
CREATE INDEX IF NOT EXISTS leads_company_job_idx ON leads (company_id, job_id);
CREATE INDEX IF NOT EXISTS leads_company_assigned_idx ON leads (company_id, assigned_user_id);

CREATE TABLE IF NOT EXISTS lead_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  reason text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_status_history_lead_idx
  ON lead_status_history (company_id, lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lead_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  client_action_id text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  property_id uuid REFERENCES cx_customer_properties(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  create_job boolean NOT NULL DEFAULT true,
  customer_mode text NOT NULL,
  property_mode text NOT NULL,
  duplicate_resolution text,
  duplicate_override_reason text,
  dispatch_notification_sent boolean NOT NULL DEFAULT false,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  converted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_conversions_company_client_action_uidx
  ON lead_conversions (company_id, client_action_id);

CREATE UNIQUE INDEX IF NOT EXISTS lead_conversions_lead_uidx
  ON lead_conversions (lead_id);

CREATE INDEX IF NOT EXISTS lead_conversions_company_job_idx
  ON lead_conversions (company_id, job_id);
