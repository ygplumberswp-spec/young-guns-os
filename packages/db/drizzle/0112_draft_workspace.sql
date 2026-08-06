-- Phase 1 polish: cross-module draft workspace (staging only)
-- Forward-only. Never apply to production from this change set without Owner approval.

DO $$ BEGIN
  CREATE TYPE draft_record_type AS ENUM (
    'quote', 'invoice', 'job', 'customer', 'document', 'marketing', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE draft_status AS ENUM ('active', 'archived', 'published');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS draft_workspace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_type draft_record_type NOT NULL,
  record_id uuid,
  draft_key text NOT NULL,
  title text,
  customer_label text,
  completion_pct integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  status draft_status NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1,
  last_edited_at timestamptz NOT NULL DEFAULT now(),
  last_edited_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS draft_workspace_company_draft_key_idx
  ON draft_workspace(company_id, draft_key);

CREATE INDEX IF NOT EXISTS draft_workspace_company_status_idx
  ON draft_workspace(company_id, status, last_edited_at DESC);

CREATE INDEX IF NOT EXISTS draft_workspace_user_idx
  ON draft_workspace(user_id, last_edited_at DESC);
