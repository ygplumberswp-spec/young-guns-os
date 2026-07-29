-- Enterprise Production Readiness, Scalability, Performance & Disaster Recovery Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'production_operations';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_recovery_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_maintenance_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_operational_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_incident_summary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_scaling_recommendation';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ops_service_module') THEN
    CREATE TYPE ops_service_module AS ENUM (
      'api_gateway',
      'authentication',
      'database',
      'cache',
      'background_workers',
      'queue_services',
      'ai_orchestration',
      'ai_provider_gateway',
      'aura_agent_runtime',
      'mission_control',
      'knowledge_graph',
      'digital_twin',
      'evolution_platform',
      'saas_platform',
      'developer_platform',
      'automation_studio',
      'integrations',
      'crm',
      'jobs',
      'scheduling',
      'dispatch',
      'fleet',
      'inventory',
      'procurement',
      'finance',
      'communications',
      'customer_portal'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ops_health_status') THEN
    CREATE TYPE ops_health_status AS ENUM ('healthy', 'degraded', 'unhealthy', 'unknown');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ops_readiness_status') THEN
    CREATE TYPE ops_readiness_status AS ENUM ('ready', 'warning', 'critical', 'unknown');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ops_maintenance_window_status') THEN
    CREATE TYPE ops_maintenance_window_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ops_maintenance_action_status') THEN
    CREATE TYPE ops_maintenance_action_status AS ENUM (
      'pending_approval',
      'approved',
      'rejected',
      'executed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ops_backup_run_status') THEN
    CREATE TYPE ops_backup_run_status AS ENUM ('pending', 'running', 'completed', 'failed', 'verified');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ops_log_severity') THEN
    CREATE TYPE ops_log_severity AS ENUM ('debug', 'info', 'warn', 'error', 'critical');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ops_deployment_status') THEN
    CREATE TYPE ops_deployment_status AS ENUM ('planned', 'in_progress', 'completed', 'rolled_back');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ops_platform_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  warning_thresholds jsonb NOT NULL DEFAULT '{}'::jsonb,
  hard_infrastructure_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  backup_retention_days integer NOT NULL DEFAULT 30,
  log_retention_days integer NOT NULL DEFAULT 90,
  recovery_point_objective_minutes integer,
  recovery_time_objective_minutes integer,
  multi_region_enabled boolean NOT NULL DEFAULT false,
  read_replica_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_service_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  module_key ops_service_module NOT NULL,
  status ops_health_status NOT NULL DEFAULT 'unknown',
  availability_percent numeric(5,2),
  latency_ms integer,
  error_rate_percent numeric(5,2),
  throughput_per_minute integer,
  dependency_health jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_successful_operation_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_service_health_snapshots_company_idx ON ops_service_health_snapshots(company_id);
CREATE INDEX IF NOT EXISTS ops_service_health_snapshots_module_idx ON ops_service_health_snapshots(module_key);

CREATE TABLE IF NOT EXISTS ops_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  api_p95_latency_ms integer,
  slow_endpoint_count integer NOT NULL DEFAULT 0,
  db_pool_usage_percent numeric(5,2),
  cache_hit_rate_percent numeric(5,2),
  queue_depth integer NOT NULL DEFAULT 0,
  worker_throughput_per_minute integer,
  background_job_failure_count integer NOT NULL DEFAULT 0,
  memory_usage_mb integer,
  cpu_usage_percent numeric(5,2),
  storage_usage_mb integer,
  webhook_latency_ms integer,
  integration_latency_ms integer,
  ai_provider_latency_ms integer,
  knowledge_graph_search_ms integer,
  digital_twin_simulation_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_performance_snapshots_company_idx ON ops_performance_snapshots(company_id);

CREATE TABLE IF NOT EXISTS ops_backup_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_key text NOT NULL,
  name text NOT NULL,
  description text,
  schedule_cron text,
  retention_days integer NOT NULL DEFAULT 30,
  includes_database boolean NOT NULL DEFAULT true,
  includes_configuration boolean NOT NULL DEFAULT true,
  includes_credentials boolean NOT NULL DEFAULT true,
  includes_knowledge_graph boolean NOT NULL DEFAULT true,
  includes_organizational_memory boolean NOT NULL DEFAULT true,
  includes_file_storage boolean NOT NULL DEFAULT true,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, policy_key)
);

CREATE TABLE IF NOT EXISTS ops_backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES ops_backup_policies(id) ON DELETE SET NULL,
  status ops_backup_run_status NOT NULL DEFAULT 'pending',
  backup_type text NOT NULL,
  size_bytes bigint,
  verification_passed boolean,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS ops_backup_runs_company_idx ON ops_backup_runs(company_id);

CREATE TABLE IF NOT EXISTS ops_recovery_test_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  backup_run_id uuid REFERENCES ops_backup_runs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'not_performed',
  validation_notes text,
  performed_at timestamptz,
  performed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_readiness_check_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  overall_status ops_readiness_status NOT NULL DEFAULT 'unknown',
  ready_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  critical_count integer NOT NULL DEFAULT 0,
  unknown_count integer NOT NULL DEFAULT 0,
  executed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_readiness_check_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES ops_readiness_check_runs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  check_key text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  status ops_readiness_status NOT NULL DEFAULT 'unknown',
  category text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ops_readiness_check_results_run_idx ON ops_readiness_check_results(run_id);

CREATE TABLE IF NOT EXISTS ops_operational_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  severity ops_log_severity NOT NULL DEFAULT 'info',
  message text NOT NULL,
  correlation_id text,
  source_table text,
  source_entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  logged_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_operational_log_entries_company_idx ON ops_operational_log_entries(company_id);
CREATE INDEX IF NOT EXISTS ops_operational_log_entries_logged_at_idx ON ops_operational_log_entries(logged_at);

CREATE TABLE IF NOT EXISTS ops_maintenance_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  affected_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  status ops_maintenance_window_status NOT NULL DEFAULT 'scheduled',
  scheduled_start_at timestamptz NOT NULL,
  scheduled_end_at timestamptz NOT NULL,
  service_notice text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_maintenance_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  maintenance_window_id uuid REFERENCES ops_maintenance_windows(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  subject text NOT NULL,
  recommendation text NOT NULL,
  status ops_maintenance_action_status NOT NULL DEFAULT 'pending_approval',
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  rollback_notes text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_deployment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version_label text NOT NULL,
  status ops_deployment_status NOT NULL DEFAULT 'planned',
  migration_sequence text,
  notes text,
  deployed_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_scaling_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  horizontal_api_scaling_enabled boolean NOT NULL DEFAULT true,
  horizontal_worker_scaling_enabled boolean NOT NULL DEFAULT true,
  queue_concurrency_limit integer NOT NULL DEFAULT 10,
  queue_partition_count integer NOT NULL DEFAULT 1,
  db_pool_max_connections integer NOT NULL DEFAULT 20,
  ai_request_queue_concurrency integer NOT NULL DEFAULT 5,
  search_index_shards integer NOT NULL DEFAULT 1,
  webhook_concurrency integer NOT NULL DEFAULT 5,
  multi_region_ready boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
