-- UX-B closure: binary evidence storage keys, idempotent uploads, sync clientActionId.
-- Forward-only. Staging only after disposable verification.

ALTER TABLE mobile_job_documentation
  ADD COLUMN IF NOT EXISTS storage_key text,
  ADD COLUMN IF NOT EXISTS checksum_sha256 text,
  ADD COLUMN IF NOT EXISTS client_action_id text,
  ADD COLUMN IF NOT EXISTS evidence_phase text;

CREATE UNIQUE INDEX IF NOT EXISTS mobile_job_documentation_client_action_uidx
  ON mobile_job_documentation (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mobile_job_documentation_job_phase_idx
  ON mobile_job_documentation (job_id, evidence_phase);

ALTER TABLE mobile_sync_queue
  ADD COLUMN IF NOT EXISTS client_action_id text;

CREATE UNIQUE INDEX IF NOT EXISTS mobile_sync_queue_client_action_uidx
  ON mobile_sync_queue (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

ALTER TABLE mobile_pending_actions
  ADD COLUMN IF NOT EXISTS client_action_id text;

CREATE UNIQUE INDEX IF NOT EXISTS mobile_pending_actions_client_action_uidx
  ON mobile_pending_actions (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;
