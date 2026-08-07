-- Historical Import + Job 360 archive foundation.
-- Staging / feature branch only — no production writes from this migration alone.
ALTER TYPE "public"."dm_entity_type" ADD VALUE IF NOT EXISTS 'price_book';
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."dm_historical_doc_match_action" AS ENUM(
    'pending',
    'link',
    'choose_different',
    'create_historical_record',
    'skip'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "source_provider" text;
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "source_external_id" text;
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "source_import_job_id" uuid;
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "historical_flags" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_company_source_external_uidx"
  ON "jobs" ("company_id", "source_provider", "source_external_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dm_historical_document_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "import_job_id" uuid REFERENCES "dm_import_jobs"("id") ON DELETE set null,
  "file_name" text NOT NULL,
  "detected_number" text,
  "detected_entity_hint" text,
  "candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "recommended_action" text DEFAULT 'CREATE_HISTORICAL_RECORD' NOT NULL,
  "recommended_candidate_id" uuid,
  "allow_silent_link" boolean DEFAULT false NOT NULL,
  "resolved_action" "dm_historical_doc_match_action" DEFAULT 'pending' NOT NULL,
  "resolved_entity_type" text,
  "resolved_entity_id" uuid,
  "resolved_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dm_historical_document_matches_company_idx"
  ON "dm_historical_document_matches" ("company_id", "created_at");
