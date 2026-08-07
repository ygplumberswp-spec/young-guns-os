-- TITAN AURA Agent Network (Department 2.2). Forward-only, staging-first.
-- Do not apply to production without Owner approval. No demo activity is inserted.
DO $$ BEGIN CREATE TYPE aura_network_agent_key AS ENUM ('executive','finance','operations','marketing','sales','hr','inventory','customer_support','compliance','fleet','market_intelligence'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE aura_network_status AS ENUM ('draft','awaiting_approval','approved','rejected','active','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE aura_network_message_kind AS ENUM ('handoff','delegation','insight','draft'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE aura_network_approval_type AS ENUM ('handoff','delegation','workflow_start','context_share','financial_action','message_send'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS aura_network_agents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 agent_key aura_network_agent_key NOT NULL, linked_agent_key text, linked_command_registry_id uuid REFERENCES aura_command_agent_registry(id) ON DELETE SET NULL,
 linked_agent_profile_id uuid REFERENCES agent_profiles(id) ON DELETE SET NULL, status aura_network_status NOT NULL DEFAULT 'draft',
 created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,agent_key));
CREATE TABLE IF NOT EXISTS aura_network_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 from_agent_key aura_network_agent_key NOT NULL, to_agent_key aura_network_agent_key NOT NULL, kind aura_network_message_kind NOT NULL,
 subject text NOT NULL, body text NOT NULL, context_domain text, status aura_network_status NOT NULL DEFAULT 'draft',
 auto_executed boolean NOT NULL DEFAULT false, created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS aura_network_workflows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 name text NOT NULL, description text, mode text NOT NULL DEFAULT 'sequential', definition jsonb NOT NULL DEFAULT '{}'::jsonb,
 status aura_network_status NOT NULL DEFAULT 'draft', created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS aura_network_workflow_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE, workflow_id uuid NOT NULL REFERENCES aura_network_workflows(id) ON DELETE CASCADE,
 status aura_network_status NOT NULL DEFAULT 'awaiting_approval', auto_executed boolean NOT NULL DEFAULT false, requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, started_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS aura_network_workflow_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE, workflow_run_id uuid NOT NULL REFERENCES aura_network_workflow_runs(id) ON DELETE CASCADE,
 agent_key aura_network_agent_key NOT NULL, title text NOT NULL, status aura_network_status NOT NULL DEFAULT 'draft', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS aura_network_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE, type aura_network_approval_type NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL,
 status aura_network_status NOT NULL DEFAULT 'awaiting_approval', auto_executed boolean NOT NULL DEFAULT false, requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, decision_notes text, created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz);
CREATE TABLE IF NOT EXISTS aura_network_context_access_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE, from_agent_key aura_network_agent_key NOT NULL, to_agent_key aura_network_agent_key NOT NULL,
 context_domain text NOT NULL, access_granted boolean NOT NULL DEFAULT false, requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS aura_network_activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE, agent_key aura_network_agent_key, action text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS aura_network_agents_company_idx ON aura_network_agents(company_id, status);
CREATE INDEX IF NOT EXISTS aura_network_messages_company_idx ON aura_network_messages(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS aura_network_approvals_company_idx ON aura_network_approvals(company_id, status, created_at DESC);
