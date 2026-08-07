-- Historical import completion — supplier provenance + searchable archive helpers.
-- Staging / feature branch only.
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "supplier_code" text;
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "source_provider" text;
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "source_external_id" text;
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "category" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppliers_company_source_external_idx"
  ON "suppliers" ("company_id", "source_provider", "source_external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppliers_company_supplier_code_idx"
  ON "suppliers" ("company_id", "supplier_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_equipment_company_serial_idx"
  ON "asset_equipment" ("company_id", "serial_number");
