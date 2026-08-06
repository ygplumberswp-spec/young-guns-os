-- Google Maps V1 — store verified coordinates / place IDs (never invent locations)
ALTER TABLE "cx_customer_properties"
  ADD COLUMN IF NOT EXISTS "latitude" double precision,
  ADD COLUMN IF NOT EXISTS "longitude" double precision,
  ADD COLUMN IF NOT EXISTS "place_id" text,
  ADD COLUMN IF NOT EXISTS "formatted_address" text,
  ADD COLUMN IF NOT EXISTS "geocoded_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "geocode_status" text;

ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "snapshot_latitude" double precision,
  ADD COLUMN IF NOT EXISTS "snapshot_longitude" double precision,
  ADD COLUMN IF NOT EXISTS "snapshot_place_id" text,
  ADD COLUMN IF NOT EXISTS "snapshot_formatted_address" text;
