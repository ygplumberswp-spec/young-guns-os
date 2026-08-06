-- Secure persistent session enhancements — sessions table only.
-- Forward-only. Safe to queue behind active Xero import (no integration table writes).
-- Adds last-activity tracking, trusted-device flag, and revocation reason for reuse detection.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_trusted_device boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revoked_reason text;

UPDATE sessions
SET last_activity_at = COALESCE(last_activity_at, created_at)
WHERE last_activity_at IS NULL;

CREATE INDEX IF NOT EXISTS sessions_user_active_idx
  ON sessions (user_id, revoked_at, expires_at);
