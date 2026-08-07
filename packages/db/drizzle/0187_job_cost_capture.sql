-- JPE-004: Live job cost capture — time entry idempotency

ALTER TABLE mobile_time_entries
  ADD COLUMN IF NOT EXISTS client_action_id text;

CREATE UNIQUE INDEX IF NOT EXISTS mobile_time_entries_company_client_action_idx
  ON mobile_time_entries (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;
