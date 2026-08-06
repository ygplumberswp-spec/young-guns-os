-- TITAN AURA Ecosystem — AURA Command Centre (Department 2.1)
-- Business memory foundation, agent coordination registry / handoffs,
-- draft actions, and executive assistant follow-ups.
-- Extends existing AURA chat, aura_memory, AGENT_REGISTRY, agent_tasks.
-- Never invents demo analytics. Never sources Personal WhatsApp private data.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.

DO $$ BEGIN
  CREATE TYPE aura_command_memory_kind AS ENUM (
    'approved_decision',
    'preference',
    'operating_pattern',
    'important_context',
    'historical_decision'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE aura_command_memory_status AS ENUM (
    'active',
    'archived',
    'superseded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE aura_command_agent_key AS ENUM (
    'finance',
    'operations',
    'marketing',
    'sales',
    'hr',
    'inventory',
    'customer_support',
    'compliance',
    'fleet',
    'market_intelligence'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE aura_command_registry_status AS ENUM (
    'planned',
    'registered',
    'active',
    'paused'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE aura_command_handoff_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE aura_command_action_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE aura_command_follow_up_status AS ENUM (
    'open',
    'done',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS aura_command_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind aura_command_memory_kind NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  status aura_command_memory_status NOT NULL DEFAULT 'active',
  source_module text,
  importance integer NOT NULL DEFAULT 3,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aura_command_memory_company_idx
  ON aura_command_memory (company_id, status, kind);
CREATE INDEX IF NOT EXISTS aura_command_memory_company_updated_idx
  ON aura_command_memory (company_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS aura_command_agent_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_key aura_command_agent_key NOT NULL,
  status aura_command_registry_status NOT NULL DEFAULT 'planned',
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, agent_key)
);

CREATE INDEX IF NOT EXISTS aura_command_agent_registry_company_idx
  ON aura_command_agent_registry (company_id, status);

CREATE TABLE IF NOT EXISTS aura_command_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_agent_key text NOT NULL DEFAULT 'executive',
  to_agent_key aura_command_agent_key NOT NULL,
  context_summary text NOT NULL,
  context_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status aura_command_handoff_status NOT NULL DEFAULT 'pending_approval',
  approval_required boolean NOT NULL DEFAULT true,
  auto_executed boolean NOT NULL DEFAULT false,
  requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aura_command_handoffs_company_status_idx
  ON aura_command_handoffs (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS aura_command_action_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  department_key text NOT NULL DEFAULT 'executive',
  suggested_action jsonb NOT NULL DEFAULT '{}'::jsonb,
  status aura_command_action_status NOT NULL DEFAULT 'pending_approval',
  approval_required boolean NOT NULL DEFAULT true,
  auto_executed boolean NOT NULL DEFAULT false,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aura_command_action_drafts_company_status_idx
  ON aura_command_action_drafts (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS aura_command_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  due_at timestamptz,
  status aura_command_follow_up_status NOT NULL DEFAULT 'open',
  source text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aura_command_follow_ups_company_status_idx
  ON aura_command_follow_ups (company_id, status, due_at);
