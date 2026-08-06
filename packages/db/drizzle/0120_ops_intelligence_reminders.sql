-- TITAN Operations Intelligence V1 — reminder/ack state (advisory only; no auto-send)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ops_reminder_type') THEN
    CREATE TYPE "public"."ops_reminder_type" AS ENUM(
      'next_job_approaching',
      'leave_now',
      'running_late',
      'on_arrival',
      'post_completion_next_job',
      'morning_brief'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ops_reminder_state_status') THEN
    CREATE TYPE "public"."ops_reminder_state_status" AS ENUM(
      'pending',
      'notified',
      'acknowledged',
      'dismissed',
      'suppressed'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ops_intelligence_reminder_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "reminder_type" "ops_reminder_type" NOT NULL,
  "dedupe_key" text NOT NULL,
  "job_id" uuid REFERENCES "jobs"("id") ON DELETE cascade,
  "technician_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "plan_date" text NOT NULL,
  "status" "ops_reminder_state_status" DEFAULT 'pending' NOT NULL,
  "payload_summary" text,
  "notified_at" timestamp with time zone,
  "acknowledged_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone,
  "acknowledged_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ops_intel_reminder_company_dedupe_uidx"
  ON "ops_intelligence_reminder_states" ("company_id", "dedupe_key");

CREATE INDEX IF NOT EXISTS "ops_intel_reminder_company_date_idx"
  ON "ops_intelligence_reminder_states" ("company_id", "plan_date");
