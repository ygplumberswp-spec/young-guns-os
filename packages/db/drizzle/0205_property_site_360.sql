-- Row 84 — CURRENT Property / Site 360
-- Additive columns on cx_customer_properties + site contact links to customer_people.
-- Does NOT create a parallel properties or equipment system.
-- Staging-first. Do not apply to production without Owner approval.

DO $$ BEGIN
  CREATE TYPE property_site_status AS ENUM ('active', 'inactive', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

ALTER TABLE "cx_customer_properties"
  ADD COLUMN IF NOT EXISTS "status" "property_site_status" NOT NULL DEFAULT 'active';
--> statement-breakpoint

ALTER TABLE "cx_customer_properties"
  ADD COLUMN IF NOT EXISTS "country" text;
--> statement-breakpoint

ALTER TABLE "cx_customer_properties"
  ADD COLUMN IF NOT EXISTS "access_instructions" text;
--> statement-breakpoint

ALTER TABLE "cx_customer_properties"
  ADD COLUMN IF NOT EXISTS "site_notes" text;
--> statement-breakpoint

ALTER TABLE "cx_customer_properties"
  ADD COLUMN IF NOT EXISTS "source_provider" text;
--> statement-breakpoint

ALTER TABLE "cx_customer_properties"
  ADD COLUMN IF NOT EXISTS "source_external_id" text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cx_customer_properties_company_status_idx"
  ON "cx_customer_properties" ("company_id", "status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cx_customer_properties_company_customer_status_idx"
  ON "cx_customer_properties" ("company_id", "customer_id", "status");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "cx_customer_properties_source_uidx"
  ON "cx_customer_properties" ("company_id", "source_provider", "source_external_id")
  WHERE "source_provider" IS NOT NULL AND "source_external_id" IS NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE property_site_contact_role AS ENUM (
    'primary',
    'project',
    'access',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "property_site_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "property_id" uuid NOT NULL REFERENCES "cx_customer_properties"("id") ON DELETE cascade,
  "person_id" uuid NOT NULL REFERENCES "customer_people"("id") ON DELETE cascade,
  "role" "property_site_contact_role" NOT NULL DEFAULT 'other',
  "is_primary" boolean NOT NULL DEFAULT false,
  "notes" text,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "property_site_contacts_unique_uidx"
  ON "property_site_contacts" ("company_id", "property_id", "person_id", "role");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "property_site_contacts_property_idx"
  ON "property_site_contacts" ("company_id", "property_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "property_site_contacts_person_idx"
  ON "property_site_contacts" ("company_id", "person_id");
