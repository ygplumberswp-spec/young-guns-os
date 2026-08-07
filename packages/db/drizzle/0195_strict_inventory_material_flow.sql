-- STRICT INVENTORY MATERIAL FLOW: returns, slip linkage, stock variance review.
DO $$ BEGIN
  CREATE TYPE "job_material_stock_variance_status" AS ENUM (
    'none',
    'review_required',
    'resolved'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "job_material_lines"
  ADD COLUMN IF NOT EXISTS "returned_quantity" numeric(12, 3) NOT NULL DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "job_material_lines"
  ADD COLUMN IF NOT EXISTS "receipt_documentation_id" uuid
    REFERENCES "documents"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "job_material_lines"
  ADD COLUMN IF NOT EXISTS "direct_cost_entry_id" uuid
    REFERENCES "job_direct_cost_entries"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "job_material_lines"
  ADD COLUMN IF NOT EXISTS "stock_variance_status" "job_material_stock_variance_status"
    NOT NULL DEFAULT 'none';
--> statement-breakpoint
ALTER TABLE "job_material_lines"
  ADD COLUMN IF NOT EXISTS "stock_variance_notes" text;
--> statement-breakpoint
ALTER TABLE "job_material_lines"
  ADD COLUMN IF NOT EXISTS "stock_variance_resolved_by_user_id" uuid
    REFERENCES "users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "job_material_lines"
  ADD COLUMN IF NOT EXISTS "stock_variance_resolved_at" timestamptz;
--> statement-breakpoint
