-- WhatsApp customer contact enrichment — tenant-safe contact sources + match review queue.
-- Forward-only. Disposable / staging apply only when Xero import quiescent — never production live ref.
-- Queues BEHIND active Xero import + global auto-sync (read-only enrichment design).

DO $$ BEGIN
  CREATE TYPE whatsapp_match_classification AS ENUM (
    'exact_verified',
    'high_confidence',
    'review_required',
    'conflicting',
    'no_match'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE contact_source_kind AS ENUM (
    'whatsapp_conversation',
    'manual_review',
    'xero_import',
    'crm'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE whatsapp_match_review_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'superseded',
    'blocked_xero_import'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS customer_contact_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  normalized_mobile text,
  original_format text,
  source contact_source_kind NOT NULL DEFAULT 'whatsapp_conversation',
  conversation_ref text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_score integer NOT NULL DEFAULT 0,
  match_classification whatsapp_match_classification NOT NULL DEFAULT 'no_match',
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_verified boolean NOT NULL DEFAULT false,
  is_service_safe boolean NOT NULL DEFAULT false,
  marketing_consent_status text NOT NULL DEFAULT 'unknown',
  verified_at timestamptz,
  verified_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_contact_sources_company_customer_idx
  ON customer_contact_sources (company_id, customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS customer_contact_sources_company_mobile_uidx
  ON customer_contact_sources (company_id, normalized_mobile)
  WHERE normalized_mobile IS NOT NULL;

CREATE TABLE IF NOT EXISTS whatsapp_match_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  whatsapp_wa_id text NOT NULL,
  whatsapp_display_name text,
  proposed_mobile text,
  proposed_mobile_normalized text,
  match_classification whatsapp_match_classification NOT NULL DEFAULT 'review_required',
  confidence_score integer NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status whatsapp_match_review_status NOT NULL DEFAULT 'pending',
  priority_rank integer NOT NULL DEFAULT 99,
  conversation_ref text,
  conflicting_customer_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_notes text,
  titan_saved boolean NOT NULL DEFAULT false,
  xero_sync_back_requested boolean NOT NULL DEFAULT false,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_match_reviews_company_status_idx
  ON whatsapp_match_reviews (company_id, status, priority_rank);

CREATE INDEX IF NOT EXISTS whatsapp_match_reviews_company_wa_id_idx
  ON whatsapp_match_reviews (company_id, whatsapp_wa_id);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_match_reviews_company_pending_wa_uidx
  ON whatsapp_match_reviews (company_id, whatsapp_wa_id)
  WHERE status = 'pending';
