-- Multi-day visits + Still Busy / Reschedule support (one canonical job).
ALTER TYPE "job_execution_phase" ADD VALUE IF NOT EXISTS 'work_continues';
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "mobile_workforce_request_type" ADD VALUE IF NOT EXISTS 'job_reschedule';
EXCEPTION WHEN others THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "job_visit_status" AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "job_visit_close_reason" AS ENUM ('still_busy', 'completed', 'rescheduled', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_visits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE cascade,
  "visit_number" integer NOT NULL,
  "status" "job_visit_status" DEFAULT 'open' NOT NULL,
  "technician_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "arrived_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "labour_minutes" integer DEFAULT 0 NOT NULL,
  "travel_minutes" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "work_completed_summary" text,
  "remaining_work_summary" text,
  "close_reason" "job_visit_close_reason",
  "material_count" integer DEFAULT 0 NOT NULL,
  "photo_count" integer DEFAULT 0 NOT NULL,
  "slip_count" integer DEFAULT 0 NOT NULL,
  "client_action_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_visits_job_visit_number_uidx"
  ON "job_visits" ("job_id", "visit_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_visits_company_job_idx"
  ON "job_visits" ("company_id", "job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_visits_open_idx"
  ON "job_visits" ("company_id", "status") WHERE "status" = 'open';
