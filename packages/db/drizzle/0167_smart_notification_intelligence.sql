-- Smart Notification Intelligence (Department 16)
-- A prioritisation and noise-reduction layer over the notification surfaces
-- that already exist: per-user `notifications` rows and Notification Centre
-- `nc_alerts` rows. Those tables are not modified and no notification is
-- copied here, so a signal can never drift from the row it came from.
-- Only Owner controls, per-person decisions, the append-only audit history and
-- approval-gated recommendations persist.
-- Real connected data only. No signal is invented.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.
-- Never touches Yoco 0123.

DO $$ BEGIN
  CREATE TYPE sn_category AS ENUM (
    'priority', 'risk', 'approval', 'opportunity', 'finance', 'cash_flow',
    'overdue_invoice', 'job_delay', 'technician_performance', 'fleet_vehicle',
    'stock_procurement', 'customer_followup', 'marketing_opportunity',
    'compliance_document', 'security', 'operations'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sn_severity AS ENUM ('critical', 'high', 'medium', 'low', 'info');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sn_signal_status AS ENUM (
    'open', 'acknowledged', 'snoozed', 'dismissed', 'escalated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sn_event_kind AS ENUM (
    'acknowledged', 'snoozed', 'dismissed', 'escalated', 'reopened',
    'settings_updated', 'category_updated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sn_action_status AS ENUM (
    'draft', 'pending_approval', 'approved', 'rejected', 'acknowledged'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS sn_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auto_actions_enabled boolean NOT NULL DEFAULT false,
  invent_signals_enabled boolean NOT NULL DEFAULT false,
  group_duplicates_enabled boolean NOT NULL DEFAULT true,
  daily_brief_enabled boolean NOT NULL DEFAULT true,
  max_feed_items integer NOT NULL DEFAULT 25,
  max_brief_items integer NOT NULL DEFAULT 10,
  global_min_severity sn_severity NOT NULL DEFAULT 'low',
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sn_settings_no_auto_actions CHECK (auto_actions_enabled = false),
  CONSTRAINT sn_settings_no_invent CHECK (invent_signals_enabled = false),
  -- A feed limit of zero would hide everything; an unbounded one would flood.
  CONSTRAINT sn_settings_feed_bounds CHECK (max_feed_items BETWEEN 1 AND 200),
  CONSTRAINT sn_settings_brief_bounds CHECK (max_brief_items BETWEEN 1 AND 50)
);

CREATE UNIQUE INDEX IF NOT EXISTS sn_settings_company_uidx ON sn_settings (company_id);

CREATE TABLE IF NOT EXISTS sn_category_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category sn_category NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  min_severity sn_severity NOT NULL DEFAULT 'low',
  digest_only boolean NOT NULL DEFAULT false,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sn_category_controls_company_category_uidx
  ON sn_category_controls (company_id, category);

CREATE TABLE IF NOT EXISTS sn_signal_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_key text NOT NULL,
  category sn_category NOT NULL,
  status sn_signal_status NOT NULL DEFAULT 'open',
  snoozed_until timestamptz,
  escalated_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A decision belongs to one person on one signal within one company.
CREATE UNIQUE INDEX IF NOT EXISTS sn_signal_states_scope_uidx
  ON sn_signal_states (company_id, user_id, group_key);

CREATE INDEX IF NOT EXISTS sn_signal_states_company_status_idx
  ON sn_signal_states (company_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS sn_signal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  group_key text,
  kind sn_event_kind NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  snoozed_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sn_signal_events_company_group_idx
  ON sn_signal_events (company_id, group_key, occurred_at DESC);

CREATE TABLE IF NOT EXISTS sn_action_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  group_key text,
  category sn_category,
  status sn_action_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  auto_executed boolean NOT NULL DEFAULT false,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sn_action_drafts_no_auto CHECK (auto_executed = false)
);

CREATE INDEX IF NOT EXISTS sn_action_drafts_queue_idx
  ON sn_action_drafts (company_id, status, created_at DESC);
