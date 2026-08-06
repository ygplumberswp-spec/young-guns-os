-- J-6.7F owner-gate audit — record OAuth initiator role on Facebook Business states.
-- Do not run on staging/production until Owner-approved migration gate.

ALTER TABLE "fb_oauth_states"
  ADD COLUMN IF NOT EXISTS "initiator_role_name" text;

-- Backfill not required: existing rows expire within 10 minutes; new connects require Owner.
