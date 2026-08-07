ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "merged_into_customer_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_merged_into_customer_id_fkey'
  ) THEN
    ALTER TABLE "customers"
      ADD CONSTRAINT "customers_merged_into_customer_id_fkey"
      FOREIGN KEY ("merged_into_customer_id") REFERENCES "customers"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'customer_duplicate_candidate_status'
  ) THEN
    CREATE TYPE "public"."customer_duplicate_candidate_status" AS ENUM('pending', 'dismissed', 'merged');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "customer_duplicate_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "left_customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE cascade,
  "right_customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE cascade,
  "confidence" integer NOT NULL,
  "match_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" "customer_duplicate_candidate_status" DEFAULT 'pending' NOT NULL,
  "survivor_customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
  "decided_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "decision_notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_duplicate_candidates_company_pair_uidx"
  ON "customer_duplicate_candidates" ("company_id", "left_customer_id", "right_customer_id");

CREATE INDEX IF NOT EXISTS "customer_duplicate_candidates_company_status_idx"
  ON "customer_duplicate_candidates" ("company_id", "status");
