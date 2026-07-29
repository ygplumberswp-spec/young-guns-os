-- Multi-AI Provider Synchronization & Unified AURA Intelligence

ALTER TYPE ai_provider_key ADD VALUE IF NOT EXISTS 'groq';
ALTER TYPE ai_provider_key ADD VALUE IF NOT EXISTS 'mistral';

ALTER TYPE ai_failover_reason ADD VALUE IF NOT EXISTS 'credit_exhausted';
ALTER TYPE ai_failover_reason ADD VALUE IF NOT EXISTS 'context_window_exceeded';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_access_mode') THEN
    CREATE TYPE ai_access_mode AS ENUM ('platform_managed', 'tenant_credentials', 'hybrid');
  END IF;
END $$;

ALTER TABLE ai_provider_resilience_configs
  ADD COLUMN IF NOT EXISTS ai_access_mode ai_access_mode NOT NULL DEFAULT 'platform_managed',
  ADD COLUMN IF NOT EXISTS blocked_categories jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS ai_comparison_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  task_prompt text NOT NULL,
  routing_category ai_routing_category,
  status text NOT NULL DEFAULT 'pending_approval',
  consolidated_recommendation text,
  disagreement_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_comparison_runs_company_id_idx ON ai_comparison_runs(company_id);
CREATE INDEX IF NOT EXISTS ai_comparison_runs_status_idx ON ai_comparison_runs(status);

CREATE TABLE IF NOT EXISTS ai_comparison_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_run_id uuid NOT NULL REFERENCES ai_comparison_runs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES ai_providers(id) ON DELETE SET NULL,
  provider_key ai_provider_key NOT NULL,
  model_key text NOT NULL,
  response_content text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_comparison_results_run_id_idx ON ai_comparison_results(comparison_run_id);
