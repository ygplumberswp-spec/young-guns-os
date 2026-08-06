-- Google Calendar live scheduling & job sync.
--
-- Purely additive: creates new google_calendar_* types/tables only. It does not
-- touch jobs, scheduling, Xero, fleet or any existing table, so it is safe to
-- apply while a Xero historical import is running.
--
-- 'google_calendar' already exists on the integration_provider enum, so
-- integration_oauth_states can carry the OAuth state for this provider with no
-- enum change.

DO $$ BEGIN
  CREATE TYPE "public"."google_calendar_connection_status" AS ENUM (
    'not_configured', 'disconnected', 'pending', 'connected', 'reauth_required', 'error'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."google_calendar_sync_direction" AS ENUM (
    'disabled', 'push_only', 'import_only', 'two_way'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."google_calendar_privacy_mode" AS ENUM (
    'busy_only', 'limited_details', 'approved_details'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."google_calendar_sync_run_status" AS ENUM (
    'queued', 'running', 'succeeded', 'partial', 'failed', 'skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."google_calendar_sync_trigger" AS ENUM (
    'manual', 'scheduled', 'oauth_connect', 'job_change'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."google_calendar_link_state" AS ENUM (
    'pending', 'synced', 'failed', 'conflict', 'deleted_remotely', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."google_calendar_conflict_type" AS ENUM (
    'job_overlaps_google_event', 'google_event_overlaps_job', 'concurrent_edit',
    'remote_event_deleted', 'remote_event_moved'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."google_calendar_conflict_status" AS ENUM (
    'open', 'acknowledged', 'resolved', 'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."google_calendar_external_event_kind" AS ENUM (
    'external_event', 'private_busy', 'titan_mirror'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."google_calendar_conversion_target" AS ENUM (
    'job', 'quote', 'inspection', 'meeting', 'reminder'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "google_calendar_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "status" "google_calendar_connection_status" DEFAULT 'disconnected' NOT NULL,
  "credentials_encrypted" text,
  "google_account_email" text,
  "google_account_id" text,
  "granted_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "auto_sync_enabled" boolean DEFAULT false NOT NULL,
  "push_jobs_enabled" boolean DEFAULT false NOT NULL,
  "import_events_enabled" boolean DEFAULT true NOT NULL,
  "default_privacy_mode" "google_calendar_privacy_mode" DEFAULT 'limited_details' NOT NULL,
  "last_sync_at" timestamptz,
  "last_successful_sync_at" timestamptz,
  "last_sync_status" "google_calendar_sync_run_status",
  "last_error" text,
  "last_error_at" timestamptz,
  "reauth_required_at" timestamptz,
  "connected_at" timestamptz,
  "disconnected_at" timestamptz,
  "connected_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "google_calendar_connections_company_unique" UNIQUE("company_id")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "google_calendar_calendars" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "connection_id" uuid NOT NULL REFERENCES "google_calendar_connections"("id") ON DELETE CASCADE,
  "google_calendar_id" text NOT NULL,
  "summary" text NOT NULL,
  "description" text,
  "time_zone" text,
  "access_role" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "selected" boolean DEFAULT false NOT NULL,
  "sync_direction" "google_calendar_sync_direction" DEFAULT 'disabled' NOT NULL,
  "privacy_mode" "google_calendar_privacy_mode" DEFAULT 'limited_details' NOT NULL,
  "sync_token" text,
  "last_sync_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "google_calendar_calendars_company_calendar_unique" UNIQUE("company_id","google_calendar_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_calendar_calendars_company_idx"
  ON "google_calendar_calendars" ("company_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "google_calendar_user_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "calendar_id" uuid NOT NULL REFERENCES "google_calendar_calendars"("id") ON DELETE CASCADE,
  "push_assigned_jobs" boolean DEFAULT true NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "google_calendar_user_mappings_company_user_unique" UNIQUE("company_id","user_id")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "google_calendar_job_event_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
  "calendar_id" uuid NOT NULL REFERENCES "google_calendar_calendars"("id") ON DELETE CASCADE,
  "google_calendar_id" text NOT NULL,
  "google_event_id" text,
  "google_etag" text,
  "google_sequence" integer,
  "payload_hash" text,
  "sync_state" "google_calendar_link_state" DEFAULT 'pending' NOT NULL,
  "meet_link" text,
  "html_link" text,
  "last_pushed_at" timestamptz,
  "last_pulled_at" timestamptz,
  "google_updated_at" timestamptz,
  "titan_updated_at" timestamptz,
  "last_error" text,
  "failure_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "google_calendar_job_event_links_job_calendar_unique" UNIQUE("company_id","job_id","google_calendar_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_calendar_job_event_links_event_idx"
  ON "google_calendar_job_event_links" ("company_id","google_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_calendar_job_event_links_job_idx"
  ON "google_calendar_job_event_links" ("job_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "google_calendar_external_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "calendar_id" uuid NOT NULL REFERENCES "google_calendar_calendars"("id") ON DELETE CASCADE,
  "google_calendar_id" text NOT NULL,
  "google_event_id" text NOT NULL,
  "google_etag" text,
  "event_kind" "google_calendar_external_event_kind" DEFAULT 'external_event' NOT NULL,
  "title" text,
  "description" text,
  "location" text,
  "organizer_email" text,
  "shows_as_busy" boolean DEFAULT true NOT NULL,
  "is_private" boolean DEFAULT false NOT NULL,
  "google_status" text,
  "start_at" timestamptz,
  "end_at" timestamptz,
  "is_all_day" boolean DEFAULT false NOT NULL,
  "recurring_event_id" text,
  "meet_link" text,
  "html_link" text,
  "google_updated_at" timestamptz,
  "converted_target" "google_calendar_conversion_target",
  "converted_entity_id" uuid,
  "converted_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "converted_at" timestamptz,
  "dismissed_at" timestamptz,
  "dismissed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "first_seen_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "google_calendar_external_events_event_unique" UNIQUE("company_id","google_calendar_id","google_event_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_calendar_external_events_window_idx"
  ON "google_calendar_external_events" ("company_id","start_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "google_calendar_sync_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "connection_id" uuid REFERENCES "google_calendar_connections"("id") ON DELETE CASCADE,
  "trigger" "google_calendar_sync_trigger" DEFAULT 'manual' NOT NULL,
  "status" "google_calendar_sync_run_status" DEFAULT 'queued' NOT NULL,
  "started_at" timestamptz,
  "finished_at" timestamptz,
  "events_imported" integer DEFAULT 0 NOT NULL,
  "events_updated" integer DEFAULT 0 NOT NULL,
  "jobs_pushed" integer DEFAULT 0 NOT NULL,
  "jobs_updated" integer DEFAULT 0 NOT NULL,
  "jobs_deleted" integer DEFAULT 0 NOT NULL,
  "conflicts_detected" integer DEFAULT 0 NOT NULL,
  "calendars_processed" integer DEFAULT 0 NOT NULL,
  "rate_limited_until" timestamptz,
  "message" text DEFAULT '' NOT NULL,
  "checkpoint" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "requested_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "lease_owner" text,
  "lease_expires_at" timestamptz,
  "heartbeat_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_calendar_sync_runs_company_created_idx"
  ON "google_calendar_sync_runs" ("company_id","created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "google_calendar_conflicts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "conflict_type" "google_calendar_conflict_type" NOT NULL,
  "status" "google_calendar_conflict_status" DEFAULT 'open' NOT NULL,
  "severity" text DEFAULT 'warn' NOT NULL,
  "job_id" uuid REFERENCES "jobs"("id") ON DELETE CASCADE,
  "external_event_id" uuid REFERENCES "google_calendar_external_events"("id") ON DELETE CASCADE,
  "job_event_link_id" uuid REFERENCES "google_calendar_job_event_links"("id") ON DELETE CASCADE,
  "fingerprint" text NOT NULL,
  "window_start" timestamptz,
  "window_end" timestamptz,
  "message" text NOT NULL,
  "detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "detected_at" timestamptz DEFAULT now() NOT NULL,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL,
  "sync_run_id" uuid REFERENCES "google_calendar_sync_runs"("id") ON DELETE SET NULL,
  "resolution_note" text,
  "resolved_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "google_calendar_conflicts_fingerprint_unique" UNIQUE("company_id","fingerprint")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_calendar_conflicts_company_status_idx"
  ON "google_calendar_conflicts" ("company_id","status");
