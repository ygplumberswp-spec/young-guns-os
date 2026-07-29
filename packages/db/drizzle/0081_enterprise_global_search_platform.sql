-- Enterprise Global Search, Universal Timeline & Cross-Module Activity Intelligence

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'search_intelligence';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_gs_search_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_gs_activity_summary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_gs_related_record_recommendation';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gs_alert_severity') THEN
    CREATE TYPE gs_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gs_alert_status') THEN
    CREATE TYPE gs_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gs_search_mode') THEN
    CREATE TYPE gs_search_mode AS ENUM ('keyword', 'fuzzy', 'natural_language', 'hybrid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gs_entity_type') THEN
    CREATE TYPE gs_entity_type AS ENUM (
      'customer', 'lead', 'contact', 'job', 'quote', 'invoice', 'payment',
      'purchase_order', 'supplier', 'inventory', 'asset', 'vehicle', 'technician',
      'property', 'document', 'ocr_content', 'knowledge_article', 'communication',
      'email', 'whatsapp', 'note', 'task', 'calendar_event', 'ai_conversation',
      'audit_log', 'automation', 'industry_pack', 'other'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gs_timeline_event_type') THEN
    CREATE TYPE gs_timeline_event_type AS ENUM (
      'lead_created', 'quote_sent', 'quote_accepted', 'job_booked', 'technician_assigned',
      'vehicle_dispatched', 'work_completed', 'invoice_issued', 'payment_received',
      'whatsapp_conversation', 'email_history', 'document_uploaded', 'ai_interaction',
      'note_added', 'task_created', 'calendar_event', 'communication', 'automation_run', 'other'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gs_feed_scope') THEN
    CREATE TYPE gs_feed_scope AS ENUM ('personal', 'team', 'company', 'department', 'ai', 'system');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gs_index_status') THEN
    CREATE TYPE gs_index_status AS ENUM ('pending', 'indexed', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS gs_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  search_policy JSONB NOT NULL DEFAULT '{}',
  timeline_policy JSONB NOT NULL DEFAULT '{}',
  feed_policy JSONB NOT NULL DEFAULT '{}',
  index_policy JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gs_search_index_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type gs_entity_type NOT NULL,
  source_module TEXT NOT NULL,
  source_entity_id UUID NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  searchable_text TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]',
  required_permissions JSONB NOT NULL DEFAULT '[]',
  status gs_index_status NOT NULL DEFAULT 'indexed',
  metadata JSONB NOT NULL DEFAULT '{}',
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gs_saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  query TEXT NOT NULL,
  search_mode gs_search_mode NOT NULL DEFAULT 'hybrid',
  filters JSONB NOT NULL DEFAULT '{}',
  entity_types JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gs_recent_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  search_mode gs_search_mode NOT NULL DEFAULT 'hybrid',
  result_count INTEGER NOT NULL DEFAULT 0,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gs_search_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  suggestion_text TEXT NOT NULL,
  suggestion_type TEXT NOT NULL DEFAULT 'ai_assisted',
  entity_type gs_entity_type,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gs_timeline_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type gs_entity_type NOT NULL,
  entity_id UUID NOT NULL,
  event_type gs_timeline_event_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  source_module TEXT NOT NULL,
  source_entity_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gs_relationship_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_entity_type gs_entity_type NOT NULL,
  from_entity_id UUID NOT NULL,
  to_entity_type gs_entity_type NOT NULL,
  to_entity_id UUID NOT NULL,
  relationship_type TEXT NOT NULL,
  source_module TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gs_activity_feed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feed_scope gs_feed_scope NOT NULL DEFAULT 'company',
  event_type TEXT NOT NULL,
  module_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_type gs_entity_type,
  entity_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gs_activity_feed_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  feed_scope gs_feed_scope NOT NULL DEFAULT 'personal',
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gs_search_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity gs_alert_severity NOT NULL DEFAULT 'warning',
  status gs_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gs_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gs_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gs_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gs_search_index_company ON gs_search_index_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_gs_timeline_entries_entity ON gs_timeline_entries(company_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_gs_activity_feed_company ON gs_activity_feed_items(company_id);
CREATE INDEX IF NOT EXISTS idx_gs_relationship_links_from ON gs_relationship_links(company_id, from_entity_type, from_entity_id);
CREATE INDEX IF NOT EXISTS idx_gs_search_alerts_company ON gs_search_alerts(company_id);
