-- Row 86 — Real Young Guns Equipment / Assets Import + Linkage
-- Additive review queue + audit over canonical asset_equipment + al_asset_registry_profiles.
-- Does NOT create a parallel equipment database. Staging-first. No Xero writes.

DO $$ BEGIN
  CREATE TYPE equipment_import_action AS ENUM (
    'DISCOVERED',
    'EXACT_MATCH',
    'CREATE',
    'UPDATE',
    'UNCHANGED',
    'REVIEW_REQUIRED',
    'SKIP',
    'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE equipment_import_review_status AS ENUM (
    'open',
    'deferred',
    'resolved_create',
    'resolved_update',
    'resolved_skip',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE equipment_import_audit_action AS ENUM (
    'equipment_create',
    'equipment_update',
    'customer_association',
    'property_association',
    'property_unlink',
    'job_service_linkage',
    'lifecycle_change',
    'source_reconciliation',
    'review_resolution',
    'preview',
    'apply_batch'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "equipment_import_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "source_provider" text NOT NULL,
  "source_external_id" text,
  "source_fingerprint" text NOT NULL,
  "matched_asset_id" uuid REFERENCES "asset_equipment"("id") ON DELETE set null,
  "proposed_customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
  "proposed_property_id" uuid REFERENCES "cx_customer_properties"("id") ON DELETE set null,
  "action" "equipment_import_action" NOT NULL DEFAULT 'REVIEW_REQUIRED',
  "status" "equipment_import_review_status" NOT NULL DEFAULT 'open',
  "review_reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "match_reason" text,
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "preview_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "field_conflicts" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "decision_notes" text,
  "resolved_asset_id" uuid REFERENCES "asset_equipment"("id") ON DELETE set null,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "resolved_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "resolved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "equipment_import_reviews_fingerprint_uidx"
  ON "equipment_import_reviews" ("company_id", "source_fingerprint");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "equipment_import_reviews_status_idx"
  ON "equipment_import_reviews" ("company_id", "status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "equipment_import_reviews_source_idx"
  ON "equipment_import_reviews" ("company_id", "source_provider", "source_external_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "equipment_import_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "asset_id" uuid REFERENCES "asset_equipment"("id") ON DELETE set null,
  "review_id" uuid REFERENCES "equipment_import_reviews"("id") ON DELETE set null,
  "action" "equipment_import_audit_action" NOT NULL,
  "source_provider" text,
  "source_external_id" text,
  "before_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "after_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "equipment_import_audit_logs_company_idx"
  ON "equipment_import_audit_logs" ("company_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "equipment_import_audit_logs_asset_idx"
  ON "equipment_import_audit_logs" ("company_id", "asset_id");
