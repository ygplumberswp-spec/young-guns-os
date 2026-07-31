-- UX-G: Communications honesty — job linkage, visibility, delivery truth, idempotency
-- Forward-only. Disposable / staging only — never apply to live from this change set.

DO $$ BEGIN
  CREATE TYPE communication_visibility AS ENUM (
    'internal_note',
    'customer_visible',
    'outbound_request'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE communication_delivery_state AS ENUM (
    'logged_only',
    'requested',
    'queued',
    'send_failed',
    'provider_delivered'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE communications
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility communication_visibility NOT NULL DEFAULT 'internal_note',
  ADD COLUMN IF NOT EXISTS delivery_state communication_delivery_state NOT NULL DEFAULT 'logged_only',
  ADD COLUMN IF NOT EXISTS client_action_id text,
  ADD COLUMN IF NOT EXISTS failure_reason text;

-- Legacy rows remain readable as internal logged notes (never claim provider delivery).
UPDATE communications
SET visibility = 'internal_note',
    delivery_state = 'logged_only'
WHERE delivery_state IS NULL OR visibility IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS communications_company_client_action_uidx
  ON communications (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS communications_company_job_idx
  ON communications (company_id, job_id)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS communications_company_customer_idx
  ON communications (company_id, customer_id, occurred_at DESC);

ALTER TABLE portal_customer_requests
  ADD COLUMN IF NOT EXISTS client_action_id text;

CREATE UNIQUE INDEX IF NOT EXISTS portal_customer_requests_company_client_action_uidx
  ON portal_customer_requests (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;
