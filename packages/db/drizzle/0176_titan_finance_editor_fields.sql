-- TITAN professional finance editor — customer fields for search and inline creation.
-- Additive only: extends customers for company name, addresses and VAT number.
-- Does not recreate quote_line_items or touch migration 0174.

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "company_name" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "billing_address" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "site_address" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "vat_number" text;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "customers_company_name_idx"
  ON "customers" ("company_id", "company_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_vat_number_idx"
  ON "customers" ("company_id", "vat_number");
