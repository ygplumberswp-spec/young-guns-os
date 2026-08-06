-- HomeShield Customer Experience (Department 7.3)
-- Extends Recurring Maintenance, Customer Portal, Communication, Billing foundations.
-- Membership plans, subscriptions, benefits, reminders, renewal/outreach drafts.
-- No fake memberships. No automatic billing / charge.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.

DO $$ BEGIN
  CREATE TYPE hs_plan_status AS ENUM ('draft', 'active', 'paused', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE hs_subscription_status AS ENUM (
    'draft', 'active', 'paused', 'past_due', 'cancelled', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE hs_billing_interval AS ENUM ('monthly', 'quarterly', 'annual', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE hs_reminder_status AS ENUM (
    'pending', 'acknowledged', 'dismissed', 'snoozed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE hs_renewal_status AS ENUM (
    'draft', 'pending_approval', 'approved', 'rejected', 'cancelled', 'executed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE hs_outreach_status AS ENUM (
    'draft', 'pending_approval', 'approved', 'rejected', 'executed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS hs_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auto_billing_enabled boolean NOT NULL DEFAULT false,
  auto_charge_enabled boolean NOT NULL DEFAULT false,
  renewal_drafts_enabled boolean NOT NULL DEFAULT true,
  outreach_drafts_enabled boolean NOT NULL DEFAULT true,
  reminder_drafts_enabled boolean NOT NULL DEFAULT true,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hs_settings_company_uidx
  ON hs_settings (company_id);

CREATE TABLE IF NOT EXISTS hs_membership_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  billing_interval hs_billing_interval NOT NULL DEFAULT 'annual',
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  status hs_plan_status NOT NULL DEFAULT 'draft',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hs_membership_plans_company_idx
  ON hs_membership_plans (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hs_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES hs_membership_plans(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status hs_subscription_status NOT NULL DEFAULT 'draft',
  starts_at timestamptz,
  renews_at timestamptz,
  ends_at timestamptz,
  auto_billing boolean NOT NULL DEFAULT false,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hs_subscriptions_company_idx
  ON hs_subscriptions (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hs_subscriptions_customer_idx
  ON hs_subscriptions (company_id, customer_id);

CREATE TABLE IF NOT EXISTS hs_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES hs_membership_plans(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hs_benefits_company_idx
  ON hs_benefits (company_id, plan_id);

CREATE TABLE IF NOT EXISTS hs_service_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES hs_subscriptions(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  maintenance_plan_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  remind_at timestamptz NOT NULL,
  status hs_reminder_status NOT NULL DEFAULT 'pending',
  acknowledged_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hs_service_reminders_company_idx
  ON hs_service_reminders (company_id, remind_at DESC);

CREATE TABLE IF NOT EXISTS hs_renewal_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES hs_subscriptions(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES hs_membership_plans(id) ON DELETE SET NULL,
  status hs_renewal_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  auto_billing boolean NOT NULL DEFAULT false,
  billing_charged boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hs_renewal_opportunities_company_idx
  ON hs_renewal_opportunities (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS hs_outreach_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES hs_subscriptions(id) ON DELETE SET NULL,
  renewal_opportunity_id uuid REFERENCES hs_renewal_opportunities(id) ON DELETE SET NULL,
  status hs_outreach_status NOT NULL DEFAULT 'draft',
  subject text NOT NULL,
  body text NOT NULL,
  email_draft_id uuid,
  auto_executed boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hs_outreach_drafts_company_idx
  ON hs_outreach_drafts (company_id, status, created_at DESC);

-- Optional FK when Recurring Maintenance Engine tables exist
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ops_recurring_maintenance_plans'
  ) THEN
    BEGIN
      ALTER TABLE hs_service_reminders
        ADD CONSTRAINT hs_service_reminders_maintenance_plan_id_fkey
        FOREIGN KEY (maintenance_plan_id)
        REFERENCES ops_recurring_maintenance_plans(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE hs_aura_kind AS ENUM (
    'renewal_opportunity',
    'maintenance_opportunity',
    'customer_value',
    'retention'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE hs_aura_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled',
    'acknowledged'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS hs_aura_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind hs_aura_kind NOT NULL,
  status hs_aura_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES hs_subscriptions(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES hs_membership_plans(id) ON DELETE SET NULL,
  maintenance_plan_id uuid,
  auto_billing boolean NOT NULL DEFAULT false,
  auto_executed boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hs_aura_insights_company_idx
  ON hs_aura_insights (company_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS hs_aura_insights_company_status_idx
  ON hs_aura_insights (company_id, status);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ops_recurring_maintenance_plans'
  ) THEN
    BEGIN
      ALTER TABLE hs_aura_insights
        ADD CONSTRAINT hs_aura_insights_maintenance_plan_id_fkey
        FOREIGN KEY (maintenance_plan_id)
        REFERENCES ops_recurring_maintenance_plans(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

