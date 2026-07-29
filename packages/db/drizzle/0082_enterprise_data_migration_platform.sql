-- Enterprise Data Import, Export & Migration Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'migration_intelligence';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_dm_mapping_suggestion';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_dm_validation_correction';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_dm_migration_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_dm_cleanup_recommendation';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dm_alert_severity') THEN
    CREATE TYPE dm_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dm_alert_status') THEN
    CREATE TYPE dm_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dm_source_format') THEN
    CREATE TYPE dm_source_format AS ENUM ('csv', 'excel', 'json', 'xml');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dm_entity_type') THEN
    CREATE TYPE dm_entity_type AS ENUM (
      'customer', 'lead', 'supplier', 'contact', 'property', 'asset', 'vehicle',
      'technician', 'job', 'quote', 'invoice', 'payment', 'inventory',
      'purchase_order', 'document', 'knowledge_article', 'user', 'role', 'settings'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dm_wizard_step') THEN
    CREATE TYPE dm_wizard_step AS ENUM (
      'select_source', 'upload_file', 'detect_structure', 'auto_map', 'manual_map',
      'validation', 'preview', 'approval', 'import', 'summary'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dm_import_status') THEN
    CREATE TYPE dm_import_status AS ENUM (
      'draft', 'uploaded', 'structure_detected', 'mapped', 'validated',
      'preview_ready', 'pending_approval', 'approved', 'importing',
      'completed', 'failed', 'rolled_back', 'cancelled'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dm_export_status') THEN
    CREATE TYPE dm_export_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dm_duplicate_action') THEN
    CREATE TYPE dm_duplicate_action AS ENUM ('merge', 'skip', 'replace', 'create_new', 'pending');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dm_validation_severity') THEN
    CREATE TYPE dm_validation_severity AS ENUM ('error', 'warning', 'info');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dm_rollback_status') THEN
    CREATE TYPE dm_rollback_status AS ENUM ('available', 'pending', 'in_progress', 'completed', 'unavailable');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dm_record_outcome') THEN
    CREATE TYPE dm_record_outcome AS ENUM ('imported', 'failed', 'skipped', 'duplicate_pending');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS dm_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  import_policy JSONB NOT NULL DEFAULT '{}',
  export_policy JSONB NOT NULL DEFAULT '{}',
  validation_policy JSONB NOT NULL DEFAULT '{}',
  duplicate_policy JSONB NOT NULL DEFAULT '{}',
  rollback_policy JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  source_format dm_source_format NOT NULL,
  entity_type dm_entity_type NOT NULL,
  wizard_step dm_wizard_step NOT NULL DEFAULT 'select_source',
  status dm_import_status NOT NULL DEFAULT 'draft',
  file_name TEXT,
  file_content TEXT,
  detected_structure JSONB NOT NULL DEFAULT '{}',
  field_mappings JSONB NOT NULL DEFAULT '{}',
  validation_summary JSONB NOT NULL DEFAULT '{}',
  preview_rows JSONB NOT NULL DEFAULT '[]',
  imported_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  rollback_status dm_rollback_status NOT NULL DEFAULT 'unavailable',
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  export_scope TEXT NOT NULL DEFAULT 'module',
  entity_type dm_entity_type,
  source_format dm_source_format NOT NULL DEFAULT 'csv',
  filters JSONB NOT NULL DEFAULT '{}',
  status dm_export_status NOT NULL DEFAULT 'pending',
  schedule_cron TEXT,
  is_scheduled BOOLEAN NOT NULL DEFAULT FALSE,
  record_count INTEGER NOT NULL DEFAULT 0,
  file_name TEXT,
  export_content TEXT,
  error_message TEXT,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_job_id UUID NOT NULL REFERENCES dm_import_jobs(id) ON DELETE CASCADE,
  source_field TEXT NOT NULL,
  target_field TEXT NOT NULL,
  confidence REAL,
  is_manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  ai_suggested BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_validation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_job_id UUID NOT NULL REFERENCES dm_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  field_name TEXT,
  severity dm_validation_severity NOT NULL DEFAULT 'error',
  error_code TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_duplicate_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_job_id UUID NOT NULL REFERENCES dm_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  duplicate_key TEXT NOT NULL,
  existing_entity_id UUID,
  proposed_action dm_duplicate_action NOT NULL DEFAULT 'pending',
  resolved_action dm_duplicate_action,
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_import_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_job_id UUID NOT NULL REFERENCES dm_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  outcome dm_record_outcome NOT NULL,
  source_entity_id UUID,
  target_entity_id UUID,
  error_message TEXT,
  source_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_migration_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_job_id UUID REFERENCES dm_import_jobs(id) ON DELETE SET NULL,
  export_job_id UUID REFERENCES dm_export_jobs(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  source_format dm_source_format,
  entity_type dm_entity_type,
  summary TEXT NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  validation_error_count INTEGER NOT NULL DEFAULT 0,
  rollback_available BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_rollback_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_job_id UUID NOT NULL REFERENCES dm_import_jobs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status dm_rollback_status NOT NULL DEFAULT 'pending',
  reason TEXT,
  records_affected INTEGER NOT NULL DEFAULT 0,
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_migration_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity dm_alert_severity NOT NULL DEFAULT 'warning',
  status dm_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  import_job_id UUID REFERENCES dm_import_jobs(id) ON DELETE SET NULL,
  export_job_id UUID REFERENCES dm_export_jobs(id) ON DELETE SET NULL,
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dm_import_jobs_company ON dm_import_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_dm_export_jobs_company ON dm_export_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_dm_validation_results_job ON dm_validation_results(import_job_id);
CREATE INDEX IF NOT EXISTS idx_dm_duplicate_reviews_job ON dm_duplicate_reviews(import_job_id);
CREATE INDEX IF NOT EXISTS idx_dm_import_records_job ON dm_import_records(import_job_id);
CREATE INDEX IF NOT EXISTS idx_dm_migration_history_company ON dm_migration_history(company_id);
CREATE INDEX IF NOT EXISTS idx_dm_migration_alerts_company ON dm_migration_alerts(company_id);
