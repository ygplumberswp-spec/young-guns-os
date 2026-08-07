ALTER TABLE "xero_rate_budget_state"
  ADD COLUMN IF NOT EXISTS "sync_paused_until" timestamptz,
  ADD COLUMN IF NOT EXISTS "sync_pause_reason" text,
  ADD COLUMN IF NOT EXISTS "last_request_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "last_response_date" text;
