-- Last-minute / call intake attribution on canonical jobs (no parallel jobs store).
DO $$ BEGIN
  CREATE TYPE "job_intake_source" AS ENUM (
    'technician',
    'owner',
    'office',
    'aura',
    'business_call',
    'personal_call_manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "job_intake_status" AS ENUM (
    'needs_office_confirmation',
    'confirmed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "intake_source" "job_intake_source";
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "intake_status" "job_intake_status";
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid
  REFERENCES "users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "intake_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_company_intake_status_idx"
  ON "jobs" ("company_id", "intake_status")
  WHERE "intake_status" = 'needs_office_confirmation';
