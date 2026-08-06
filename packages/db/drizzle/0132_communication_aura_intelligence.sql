-- Communication AURA Intelligence
-- Message prioritisation, honest sentiment, smart-reply / follow-up drafts,
-- communication scoring, customer insights, and CRM/timeline link proposals.
-- Extends Communications Platform inbox + Email Centre / Timeline patterns.
-- Business channels only — does not source Personal WhatsApp.
-- Drafts require Owner/staff approval; never auto-send; never invent scores.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.

DO $$ BEGIN
  CREATE TYPE comm_aura_source_kind AS ENUM (
    'business_gmail',
    'business_whatsapp'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_aura_channel AS ENUM (
    'email',
    'whatsapp'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_aura_priority AS ENUM (
    'critical',
    'high',
    'normal',
    'low'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_aura_sentiment AS ENUM (
    'positive',
    'neutral',
    'negative',
    'mixed',
    'unavailable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_aura_proposal_status AS ENUM (
    'pending_approval',
    'approved',
    'rejected',
    'executed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_aura_draft_type AS ENUM (
    'smart_reply',
    'follow_up'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_aura_link_target AS ENUM (
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

CREATE TABLE IF NOT EXISTS comm_aura_message_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inbox_item_id uuid NOT NULL REFERENCES comm_platform_inbox_index(id) ON DELETE CASCADE,
  source_kind comm_aura_source_kind NOT NULL,
  channel comm_aura_channel NOT NULL,
  priority comm_aura_priority NOT NULL DEFAULT 'normal',
  communication_score integer NOT NULL DEFAULT 0,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  sentiment comm_aura_sentiment NOT NULL DEFAULT 'unavailable',
  sentiment_confidence integer,
  sentiment_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  sentiment_rationale text,
  linked_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  linked_lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  linked_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  timeline_linked boolean NOT NULL DEFAULT false,
  follow_up_suggested boolean NOT NULL DEFAULT false,
  analysed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comm_aura_message_scores_company_inbox_uq UNIQUE (company_id, inbox_item_id),
  CONSTRAINT comm_aura_message_scores_score_range CHECK (
    communication_score >= 0 AND communication_score <= 100
  ),
  CONSTRAINT comm_aura_message_scores_sentiment_honesty CHECK (
    (sentiment = 'unavailable' AND sentiment_confidence IS NULL)
    OR (sentiment <> 'unavailable' AND sentiment_confidence IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS comm_aura_message_scores_company_priority_idx
  ON comm_aura_message_scores (company_id, priority, communication_score DESC);

CREATE INDEX IF NOT EXISTS comm_aura_message_scores_customer_idx
  ON comm_aura_message_scores (company_id, linked_customer_id);

CREATE TABLE IF NOT EXISTS comm_aura_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inbox_item_id uuid REFERENCES comm_platform_inbox_index(id) ON DELETE SET NULL,
  draft_type comm_aura_draft_type NOT NULL,
  status comm_aura_proposal_status NOT NULL DEFAULT 'pending_approval',
  channel comm_aura_channel NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  subject text NOT NULL,
  body text NOT NULL,
  auto_send boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comm_aura_drafts_no_auto_send CHECK (auto_send = false)
);

CREATE INDEX IF NOT EXISTS comm_aura_drafts_queue_idx
  ON comm_aura_drafts (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS comm_aura_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inbox_item_id uuid REFERENCES comm_platform_inbox_index(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  status comm_aura_proposal_status NOT NULL DEFAULT 'pending_approval',
  subject text NOT NULL,
  recommendation text NOT NULL,
  due_hint text,
  auto_executed boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comm_aura_follow_ups_no_auto CHECK (auto_executed = false)
);

CREATE INDEX IF NOT EXISTS comm_aura_follow_ups_queue_idx
  ON comm_aura_follow_ups (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS comm_aura_link_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inbox_item_id uuid REFERENCES comm_platform_inbox_index(id) ON DELETE SET NULL,
  link_target_type comm_aura_link_target NOT NULL,
  link_target_id uuid,
  status comm_aura_proposal_status NOT NULL DEFAULT 'pending_approval',
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
  CONSTRAINT comm_aura_link_proposals_no_auto CHECK (auto_linked = false)
);

CREATE INDEX IF NOT EXISTS comm_aura_link_proposals_queue_idx
  ON comm_aura_link_proposals (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS comm_aura_customer_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  message_count integer NOT NULL DEFAULT 0,
  unread_count integer NOT NULL DEFAULT 0,
  average_score integer,
  dominant_sentiment comm_aura_sentiment NOT NULL DEFAULT 'unavailable',
  sentiment_availability text NOT NULL DEFAULT 'unavailable',
  open_follow_ups integer NOT NULL DEFAULT 0,
  pending_drafts integer NOT NULL DEFAULT 0,
  linked_job_count integer NOT NULL DEFAULT 0,
  last_communication_at timestamptz,
  summary text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comm_aura_customer_insights_company_customer_uq UNIQUE (company_id, customer_id)
);

CREATE INDEX IF NOT EXISTS comm_aura_customer_insights_company_idx
  ON comm_aura_customer_insights (company_id, updated_at DESC);
