-- XERO-003: near-real-time invoice webhook processing, targeted refresh jobs, rate budget (staging only)
CREATE TABLE IF NOT EXISTS xero_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  xero_tenant_id text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  event_category text NOT NULL,
  event_type text NOT NULL,
  resource_id text NOT NULL,
  resource_url text,
  event_date_utc timestamptz,
  first_event_sequence integer,
  last_event_sequence integer,
  processing_status text NOT NULL DEFAULT 'received',
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS xero_webhook_events_company_idx ON xero_webhook_events (company_id, received_at DESC);
CREATE INDEX IF NOT EXISTS xero_webhook_events_tenant_idx ON xero_webhook_events (xero_tenant_id, received_at DESC);
CREATE INDEX IF NOT EXISTS xero_webhook_events_status_idx ON xero_webhook_events (processing_status, received_at);

CREATE TABLE IF NOT EXISTS xero_targeted_refresh_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  xero_entity_id text NOT NULL,
  priority text NOT NULL DEFAULT 'background',
  status text NOT NULL DEFAULT 'pending',
  dedupe_key text NOT NULL UNIQUE,
  retry_count integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  result_entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS xero_targeted_refresh_jobs_company_status_idx
  ON xero_targeted_refresh_jobs (company_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS xero_targeted_refresh_jobs_priority_idx
  ON xero_targeted_refresh_jobs (priority, scheduled_at);

CREATE TABLE IF NOT EXISTS xero_rate_budget_state (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  min_limit_remaining integer,
  day_limit_remaining integer,
  app_min_limit_remaining integer,
  rate_limit_problem text,
  retry_after_until timestamptz,
  last_correlation_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
