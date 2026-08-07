-- Personal WhatsApp Intelligence Workflow
-- Extends Communications Platform personal threads + PCI approval patterns.
-- Owner-scoped. Private by default. Never auto-link. Never auto-send.
-- Does not migrate personal numbers into Business WhatsApp.
-- Forward-only. Do not apply to production from this change set without Owner approval.

DO $$ BEGIN
  CREATE TYPE personal_wa_intel_classification AS ENUM (
    'customer',
    'supplier',
    'employee',
    'business_opportunity',
    'private_personal'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE personal_wa_intel_proposal_status AS ENUM (
    'pending_approval',
    'approved',
    'rejected',
    'executed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE personal_wa_intel_link_target AS ENUM (
    'customer',
    'lead',
    'job',
    'quote',
    'invoice',
    'property',
    'supplier',
    'staff',
    'timeline'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE personal_wa_intel_aura_type AS ENUM (
    'next_action',
    'draft_reply',
    'approval_request'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS personal_wa_intel_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  personal_thread_id uuid NOT NULL REFERENCES comm_platform_personal_threads(id) ON DELETE CASCADE,
  personal_comm_conversation_id uuid REFERENCES personal_comm_conversations(id) ON DELETE SET NULL,
  classification personal_wa_intel_classification NOT NULL DEFAULT 'private_personal',
  classification_confidence integer NOT NULL DEFAULT 0,
  manual_override personal_wa_intel_classification,
  rationale text,
  privacy_excluded boolean NOT NULL DEFAULT true,
  excluded_from_business_search boolean NOT NULL DEFAULT true,
  extraction jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  linked_lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  linked_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  linked_property_id uuid,
  timeline_linked boolean NOT NULL DEFAULT false,
  classified_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_wa_intel_classifications_thread_owner_uq UNIQUE (company_id, owner_user_id, personal_thread_id)
);

CREATE INDEX IF NOT EXISTS personal_wa_intel_classifications_company_owner_idx
  ON personal_wa_intel_classifications (company_id, owner_user_id);
CREATE INDEX IF NOT EXISTS personal_wa_intel_classifications_classification_idx
  ON personal_wa_intel_classifications (company_id, classification);

CREATE TABLE IF NOT EXISTS personal_wa_intel_link_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  personal_thread_id uuid REFERENCES comm_platform_personal_threads(id) ON DELETE SET NULL,
  classification_id uuid REFERENCES personal_wa_intel_classifications(id) ON DELETE SET NULL,
  link_target_type personal_wa_intel_link_target NOT NULL,
  link_target_id uuid,
  status personal_wa_intel_proposal_status NOT NULL DEFAULT 'pending_approval',
  subject text NOT NULL,
  recommendation text NOT NULL,
  notes text,
  auto_linked boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  executed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_wa_intel_link_proposals_no_auto CHECK (auto_linked = false)
);

CREATE INDEX IF NOT EXISTS personal_wa_intel_link_proposals_queue_idx
  ON personal_wa_intel_link_proposals (company_id, owner_user_id, status);

CREATE TABLE IF NOT EXISTS personal_wa_intel_aura_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  personal_thread_id uuid REFERENCES comm_platform_personal_threads(id) ON DELETE SET NULL,
  suggestion_type personal_wa_intel_aura_type NOT NULL,
  status personal_wa_intel_proposal_status NOT NULL DEFAULT 'pending_approval',
  subject text NOT NULL,
  body text NOT NULL,
  auto_send boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_wa_intel_aura_no_auto_send CHECK (auto_send = false)
);

CREATE INDEX IF NOT EXISTS personal_wa_intel_aura_queue_idx
  ON personal_wa_intel_aura_suggestions (company_id, owner_user_id, status);
