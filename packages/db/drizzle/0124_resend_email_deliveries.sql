-- Resend transactional email delivery tracking + webhook idempotency.
-- Forward-only / staging-safe (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS resend_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_connection_id uuid REFERENCES integration_connections(id) ON DELETE SET NULL,
  communication_id uuid REFERENCES communications(id) ON DELETE SET NULL,
  purpose text NOT NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  -- Honest lifecycle: sent (API accepted) | delivered (webhook) | failed (API/webhook)
  status text NOT NULL DEFAULT 'sent',
  resend_email_id text,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS resend_email_deliveries_company_resend_uidx
  ON resend_email_deliveries (company_id, resend_email_id)
  WHERE resend_email_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS resend_email_deliveries_company_created_idx
  ON resend_email_deliveries (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS resend_email_deliveries_company_communication_idx
  ON resend_email_deliveries (company_id, communication_id)
  WHERE communication_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS resend_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_connection_id uuid REFERENCES integration_connections(id) ON DELETE SET NULL,
  delivery_id uuid REFERENCES resend_email_deliveries(id) ON DELETE SET NULL,
  -- Svix message id (idempotency key)
  svix_id text NOT NULL,
  event_type text NOT NULL,
  resend_email_id text,
  event_status text NOT NULL DEFAULT 'received',
  outcome text,
  payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS resend_webhook_events_company_svix_uidx
  ON resend_webhook_events (company_id, svix_id);

CREATE INDEX IF NOT EXISTS resend_webhook_events_company_received_idx
  ON resend_webhook_events (company_id, received_at DESC);
