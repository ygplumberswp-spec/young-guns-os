-- Market Intelligence (Department 17)
-- An outward-looking read layer over evidence that already exists: the market
-- records captured in Enterprise Marketing Intelligence
-- (`mi_market_intelligence_records`), connected search keyword data
-- (`mi_seo_keywords`), the supplier price catalogue and the company's own
-- leads, quotes and jobs. None of those tables are modified and no observation
-- is copied here, so an insight can never drift from the rows behind it.
-- Only the Owner's source register, controls, publication decisions,
-- approval-gated recommendations and audit history persist.
-- Nothing is fetched or scraped from here. No competitor price, market share,
-- demand figure or trend is ever invented.
-- Real connected data only.
-- Forward-only. Staging-first. Do not apply to production without Owner approval.
-- Never touches Yoco 0123.

DO $$ BEGIN
  CREATE TYPE mkt_topic AS ENUM (
    'competitor_activity', 'industry_trend', 'pricing_position', 'demand_trend',
    'seasonal_demand', 'search_trend', 'service_area_demand',
    'new_service_opportunity', 'supplier_product_signal', 'marketing_opportunity'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mkt_evidence_origin AS ENUM (
    'own_records', 'connected_provider', 'public_source', 'manual_entry'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mkt_insight_status AS ENUM ('draft', 'approved', 'rejected', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mkt_opportunity_status AS ENUM (
    'draft', 'pending_approval', 'approved', 'rejected', 'acknowledged'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mkt_event_kind AS ENUM (
    'settings_updated', 'source_registered', 'source_updated', 'insight_approved',
    'insight_rejected', 'insight_archived', 'insight_reopened',
    'opportunity_created', 'opportunity_decided', 'opportunity_refreshed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS mkt_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auto_actions_enabled boolean NOT NULL DEFAULT false,
  invent_market_data_enabled boolean NOT NULL DEFAULT false,
  external_fetch_enabled boolean NOT NULL DEFAULT false,
  lookback_days integer NOT NULL DEFAULT 365,
  staleness_days integer NOT NULL DEFAULT 30,
  min_evidence_records integer NOT NULL DEFAULT 5,
  require_registered_source boolean NOT NULL DEFAULT true,
  publish_approved_only boolean NOT NULL DEFAULT true,
  notes text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mkt_settings_no_auto_actions CHECK (auto_actions_enabled = false),
  CONSTRAINT mkt_settings_no_invent CHECK (invent_market_data_enabled = false),
  -- Nothing may reach outside this system from here.
  CONSTRAINT mkt_settings_no_external_fetch CHECK (external_fetch_enabled = false),
  -- A window too short measures noise; one too long calls history current.
  CONSTRAINT mkt_settings_lookback_bounds CHECK (lookback_days BETWEEN 30 AND 730),
  CONSTRAINT mkt_settings_staleness_bounds CHECK (staleness_days BETWEEN 7 AND 365),
  -- At least one real record must sit behind any claim.
  CONSTRAINT mkt_settings_evidence_bounds CHECK (min_evidence_records BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS mkt_settings_company_uidx ON mkt_settings (company_id);

CREATE TABLE IF NOT EXISTS mkt_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  label text NOT NULL,
  origin mkt_evidence_origin NOT NULL,
  permitted boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  reference text,
  notes text,
  registered_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A source cannot be verified without first being attested as permitted.
  CONSTRAINT mkt_sources_verified_requires_permitted CHECK (verified = false OR permitted = true)
);

CREATE UNIQUE INDEX IF NOT EXISTS mkt_sources_company_key_uidx
  ON mkt_sources (company_id, source_key);

CREATE TABLE IF NOT EXISTS mkt_insight_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  insight_key text NOT NULL,
  topic mkt_topic NOT NULL,
  status mkt_insight_status NOT NULL DEFAULT 'draft',
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A publication decision belongs to one insight within one company.
CREATE UNIQUE INDEX IF NOT EXISTS mkt_insight_states_scope_uidx
  ON mkt_insight_states (company_id, insight_key);

CREATE INDEX IF NOT EXISTS mkt_insight_states_company_status_idx
  ON mkt_insight_states (company_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS mkt_opportunity_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  insight_key text,
  topic mkt_topic,
  status mkt_opportunity_status NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL,
  confidence text NOT NULL DEFAULT 'insufficient',
  auto_executed boolean NOT NULL DEFAULT false,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mkt_opportunity_drafts_no_auto CHECK (auto_executed = false)
);

CREATE INDEX IF NOT EXISTS mkt_opportunity_drafts_queue_idx
  ON mkt_opportunity_drafts (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS mkt_signal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  insight_key text,
  kind mkt_event_kind NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mkt_signal_events_company_insight_idx
  ON mkt_signal_events (company_id, insight_key, occurred_at DESC);
