-- TITAN AURA Ecosystem — AURA Evolution / Learning Agent (Department 2.3)
-- Decision learning, pattern recognition, recommendation scoring, Owner controls,
-- and knowledge memory links extending Command Centre / aura_memory.
-- Learns from real approval/workflow signals only. Never invents demo insights.
-- No automatic business rule changes, financial actions, or customer communication.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.

DO $$ BEGIN
  CREATE TYPE aura_evolution_decision_source AS ENUM (
    'command_centre_memory',
    'command_centre_action',
    'command_centre_handoff',
    'agent_task',
    'workflow_aura_suggestion',
    'maintenance_aura_suggestion',
    'evolution_recommendation',
    'network_approval'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE aura_evolution_decision_outcome AS ENUM (
    'approved',
    'rejected',
    'accepted',
    'dismissed',
    'completed',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE aura_evolution_pattern_kind AS ENUM (
    'busy_period',
    'customer_behaviour',
    'revenue_trend',
    'job_trend',
    'maintenance_opportunity',
    'operational_bottleneck',
    'communication_pattern'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE aura_evolution_pattern_availability AS ENUM (
    'available',
    'insufficient_data',
    'unavailable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE aura_evolution_insight_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'removed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE aura_evolution_learning_item_kind AS ENUM (
    'decision',
    'pattern',
    'insight',
    'recommendation_score',
    'knowledge_link'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE aura_evolution_knowledge_kind AS ENUM (
    'preference',
    'approved_process',
    'operating_rule',
    'important_context'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS aura_evolution_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  learning_enabled boolean NOT NULL DEFAULT false,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_evolution_settings_company_unique UNIQUE (company_id)
);

CREATE TABLE IF NOT EXISTS aura_evolution_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_type aura_evolution_decision_source NOT NULL,
  source_entity_id uuid,
  title text NOT NULL,
  reasoning_context text NOT NULL,
  outcome aura_evolution_decision_outcome NOT NULL DEFAULT 'unknown',
  outcome_notes text,
  improvement_opportunity text,
  decided_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aura_evolution_decisions_company_idx
  ON aura_evolution_decisions (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS aura_evolution_decisions_source_idx
  ON aura_evolution_decisions (company_id, source_type, source_entity_id);

CREATE TABLE IF NOT EXISTS aura_evolution_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind aura_evolution_pattern_kind NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  availability aura_evolution_pattern_availability NOT NULL DEFAULT 'unavailable',
  confidence double precision,
  sample_size integer NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  honest_gap text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aura_evolution_patterns_company_idx
  ON aura_evolution_patterns (company_id, kind);

CREATE TABLE IF NOT EXISTS aura_evolution_recommendation_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_module text NOT NULL,
  recommendation_key text NOT NULL,
  title text NOT NULL,
  times_proposed integer NOT NULL DEFAULT 0,
  times_accepted integer NOT NULL DEFAULT 0,
  times_rejected integer NOT NULL DEFAULT 0,
  success_rate double precision,
  confidence double precision,
  improvement_suggestion text,
  last_outcome_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aura_evolution_rec_scores_company_idx
  ON aura_evolution_recommendation_scores (company_id, source_module);
CREATE UNIQUE INDEX IF NOT EXISTS aura_evolution_rec_scores_key_uidx
  ON aura_evolution_recommendation_scores (company_id, source_module, recommendation_key);

CREATE TABLE IF NOT EXISTS aura_evolution_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text NOT NULL,
  category text NOT NULL DEFAULT 'improvement',
  status aura_evolution_insight_status NOT NULL DEFAULT 'pending_approval',
  confidence double precision,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_approval boolean NOT NULL DEFAULT true,
  auto_executed boolean NOT NULL DEFAULT false,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aura_evolution_insights_company_idx
  ON aura_evolution_insights (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS aura_evolution_learning_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind aura_evolution_learning_item_kind NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  linked_entity_type text,
  linked_entity_id uuid,
  removed boolean NOT NULL DEFAULT false,
  removed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  removed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aura_evolution_learning_items_company_idx
  ON aura_evolution_learning_items (company_id, removed, created_at DESC);

CREATE TABLE IF NOT EXISTS aura_evolution_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind aura_evolution_knowledge_kind NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  command_memory_id uuid REFERENCES aura_command_memory(id) ON DELETE SET NULL,
  aura_memory_id uuid REFERENCES aura_memory(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aura_evolution_knowledge_company_idx
  ON aura_evolution_knowledge (company_id, enabled, created_at DESC);
