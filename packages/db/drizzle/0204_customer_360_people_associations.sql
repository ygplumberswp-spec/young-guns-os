-- Row 83 — CURRENT Customer 360
-- Additive canonical people/contacts + non-destructive source associations.
-- Does NOT merge/delete Xero customers. Does NOT move quote/invoice ownership.
-- Staging-first. Do not apply to production without Owner approval.

DO $$ BEGIN
  CREATE TYPE customer_person_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE customer_source_association_status AS ENUM ('active', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "customer_people" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE cascade,
  "first_name" text,
  "last_name" text,
  "display_name" text NOT NULL,
  "role_title" text,
  "email" text,
  "phone" text,
  "mobile" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "is_billing_contact" boolean DEFAULT false NOT NULL,
  "is_site_contact" boolean DEFAULT false NOT NULL,
  "email_allowed" boolean DEFAULT true NOT NULL,
  "sms_allowed" boolean DEFAULT true NOT NULL,
  "whatsapp_allowed" boolean DEFAULT true NOT NULL,
  "phone_allowed" boolean DEFAULT true NOT NULL,
  "preferred_contact_method" text,
  "consent_status" text DEFAULT 'unknown' NOT NULL,
  "consent_source" text,
  "consent_captured_at" timestamptz,
  "status" "customer_person_status" DEFAULT 'active' NOT NULL,
  "notes" text,
  "source_provider" text,
  "source_external_id" text,
  "linked_source_customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
  "provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "updated_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "customer_people_company_customer_idx"
  ON "customer_people" ("company_id", "customer_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "customer_people_company_status_idx"
  ON "customer_people" ("company_id", "status");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "customer_people_source_uidx"
  ON "customer_people" ("company_id", "source_provider", "source_external_id")
  WHERE "source_provider" IS NOT NULL AND "source_external_id" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "customer_source_associations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "canonical_customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE cascade,
  "source_customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE restrict,
  "person_id" uuid REFERENCES "customer_people"("id") ON DELETE set null,
  "association_role" text DEFAULT 'related_person' NOT NULL,
  "status" "customer_source_association_status" DEFAULT 'active' NOT NULL,
  "reason" text,
  "source_provider" text,
  "source_external_id" text,
  "preserves_financial_ownership" boolean DEFAULT true NOT NULL,
  "destructive_merge" boolean DEFAULT false NOT NULL,
  "xero_write" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "removed_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "removed_at" timestamptz,
  CONSTRAINT "customer_source_assoc_not_self_chk"
    CHECK ("canonical_customer_id" <> "source_customer_id"),
  CONSTRAINT "customer_source_assoc_no_destructive_chk"
    CHECK ("destructive_merge" = false),
  CONSTRAINT "customer_source_assoc_no_xero_write_chk"
    CHECK ("xero_write" = false),
  CONSTRAINT "customer_source_assoc_preserves_finance_chk"
    CHECK ("preserves_financial_ownership" = true)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "customer_source_assoc_active_uidx"
  ON "customer_source_associations" ("company_id", "canonical_customer_id", "source_customer_id")
  WHERE "status" = 'active';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "customer_source_assoc_canonical_idx"
  ON "customer_source_associations" ("company_id", "canonical_customer_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "customer_source_assoc_source_idx"
  ON "customer_source_associations" ("company_id", "source_customer_id");
