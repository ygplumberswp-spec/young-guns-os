-- Enterprise Customer Experience, Self-Service Portal & Digital Engagement Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'customer_experience';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_cx_support_request';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_cx_appointment_request';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_cx_document_request';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cx_booking_status') THEN
    CREATE TYPE cx_booking_status AS ENUM (
      'draft',
      'pending_approval',
      'approved',
      'confirmed',
      'rejected',
      'cancelled',
      'completed'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cx_booking_type') THEN
    CREATE TYPE cx_booking_type AS ENUM ('standard', 'emergency', 'reschedule', 'cancellation');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cx_review_type') THEN
    CREATE TYPE cx_review_type AS ENUM (
      'satisfaction_survey',
      'job_rating',
      'technician_rating',
      'business_review',
      'complaint',
      'internal_feedback'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cx_review_status') THEN
    CREATE TYPE cx_review_status AS ENUM ('submitted', 'acknowledged', 'resolved', 'closed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cx_referral_status') THEN
    CREATE TYPE cx_referral_status AS ENUM ('invited', 'registered', 'converted', 'rewarded', 'expired');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cx_loyalty_tier') THEN
    CREATE TYPE cx_loyalty_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'custom');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cx_document_access_type') THEN
    CREATE TYPE cx_document_access_type AS ENUM (
      'invoice',
      'quotation',
      'certificate',
      'compliance_report',
      'job_card',
      'warranty',
      'upload'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS cx_platform_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  global_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  branding_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  portal_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  communication_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  engagement_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  loyalty_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  tracking_enabled boolean NOT NULL DEFAULT false,
  pwa_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cx_customer_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  portal_user_id uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  property_name text NOT NULL,
  address_line1 text,
  address_line2 text,
  city text,
  postal_code text,
  is_primary boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cx_appointment_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  portal_user_id uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  property_id uuid REFERENCES cx_customer_properties(id) ON DELETE SET NULL,
  booking_type cx_booking_type NOT NULL DEFAULT 'standard',
  status cx_booking_status NOT NULL DEFAULT 'pending_approval',
  subject text NOT NULL,
  preferred_date date,
  preferred_time_window text,
  job_notes text,
  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cx_customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  access_type cx_document_access_type NOT NULL,
  title text NOT NULL,
  file_name text,
  version integer NOT NULL DEFAULT 1,
  uploaded_by_portal_user_id uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cx_reviews_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  portal_user_id uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  review_type cx_review_type NOT NULL,
  status cx_review_status NOT NULL DEFAULT 'submitted',
  rating integer,
  subject text NOT NULL,
  feedback text NOT NULL,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cx_loyalty_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  tier cx_loyalty_tier NOT NULL DEFAULT 'bronze',
  points_required integer NOT NULL DEFAULT 0,
  reward_description text,
  discount_percent numeric(5,2),
  is_active boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cx_loyalty_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  referrer_customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  referrer_portal_user_id uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  referred_email text NOT NULL,
  referred_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  status cx_referral_status NOT NULL DEFAULT 'invited',
  reward_applied boolean NOT NULL DEFAULT false,
  invited_at timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz
);

CREATE TABLE IF NOT EXISTS cx_engagement_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  portal_user_id uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  whatsapp_enabled boolean NOT NULL DEFAULT true,
  marketing_enabled boolean NOT NULL DEFAULT false,
  tracking_consent boolean NOT NULL DEFAULT false,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, portal_user_id)
);

CREATE TABLE IF NOT EXISTS cx_analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  portal_usage_count integer NOT NULL DEFAULT 0,
  mobile_usage_count integer NOT NULL DEFAULT 0,
  booking_conversion_rate numeric(5,2),
  customer_satisfaction_score numeric(5,2),
  avg_response_time_hours numeric(10,2),
  technician_arrival_accuracy numeric(5,2),
  referral_count integer NOT NULL DEFAULT 0,
  loyalty_participation_count integer NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cx_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  portal_user_id uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_customer_properties_customer_idx ON cx_customer_properties (company_id, customer_id);
CREATE INDEX IF NOT EXISTS cx_appointment_bookings_customer_idx ON cx_appointment_bookings (company_id, customer_id, status);
CREATE INDEX IF NOT EXISTS cx_customer_documents_customer_idx ON cx_customer_documents (company_id, customer_id);
CREATE INDEX IF NOT EXISTS cx_reviews_feedback_company_idx ON cx_reviews_feedback (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cx_loyalty_referrals_company_idx ON cx_loyalty_referrals (company_id, status);
CREATE INDEX IF NOT EXISTS cx_analytics_snapshots_company_captured_idx ON cx_analytics_snapshots (company_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS cx_audit_logs_company_created_idx ON cx_audit_logs (company_id, created_at DESC);
