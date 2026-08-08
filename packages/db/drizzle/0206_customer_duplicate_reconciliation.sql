-- Row 85 — Customer Duplicate Detection / Safe Xero Contact Reconciliation
-- Additive reconciliation lifecycle over existing customer_duplicate_candidates.
-- Reuses customer_people + customer_source_associations for same-company/different-person.
-- Does NOT create a parallel customer database. Staging-first. No Xero writes.

DO $$ BEGIN
  CREATE TYPE customer_duplicate_confidence_label AS ENUM (
    'HIGH_CONFIDENCE_DUPLICATE',
    'POSSIBLE_DUPLICATE',
    'SAME_COMPANY_DIFFERENT_CONTACT',
    'LIKELY_DIFFERENT',
    'REVIEW_REQUIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE customer_duplicate_resolution_type AS ENUM (
    'NOT_DUPLICATE',
    'SAME_COMPANY_DIFFERENT_PERSON',
    'TRUE_DUPLICATE_CANONICALIZE',
    'DEFER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE customer_duplicate_reconciliation_status AS ENUM (
    'unreviewed',
    'draft',
    'approved',
    'executed',
    'reversed',
    'dismissed',
    'deferred'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "customer_duplicate_reconciliations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "candidate_id" uuid REFERENCES "customer_duplicate_candidates"("id") ON DELETE set null,
  "left_customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE cascade,
  "right_customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE cascade,
  "canonical_customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
  "secondary_customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
  "confidence_label" "customer_duplicate_confidence_label" NOT NULL DEFAULT 'REVIEW_REQUIRED',
  "suggested_resolution" "customer_duplicate_resolution_type",
  "resolution_type" "customer_duplicate_resolution_type",
  "status" "customer_duplicate_reconciliation_status" NOT NULL DEFAULT 'unreviewed',
  "match_signals" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "differing_signals" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "rationale" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "field_compares" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "field_conflict_selections" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "preview_hash" text,
  "preview_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "impact_summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "person_id" uuid REFERENCES "customer_people"("id") ON DELETE set null,
  "association_id" uuid REFERENCES "customer_source_associations"("id") ON DELETE set null,
  "reversible" boolean NOT NULL DEFAULT true,
  "irreversible_warning" text,
  "xero_writes" integer NOT NULL DEFAULT 0,
  "moves_financial_ownership" boolean NOT NULL DEFAULT false,
  "drafted_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "approved_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "executed_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "reversed_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "decision_notes" text,
  "drafted_at" timestamptz,
  "approved_at" timestamptz,
  "executed_at" timestamptz,
  "reversed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "customer_duplicate_reconciliations_xero_writes_zero_chk"
    CHECK ("xero_writes" = 0),
  CONSTRAINT "customer_duplicate_reconciliations_no_finance_move_chk"
    CHECK ("moves_financial_ownership" = false)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "customer_duplicate_reconciliations_pair_uidx"
  ON "customer_duplicate_reconciliations" ("company_id", "left_customer_id", "right_customer_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "customer_duplicate_reconciliations_status_idx"
  ON "customer_duplicate_reconciliations" ("company_id", "status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "customer_duplicate_reconciliations_confidence_idx"
  ON "customer_duplicate_reconciliations" ("company_id", "confidence_label");
