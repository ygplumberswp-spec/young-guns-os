-- Finance editor document round-trip fields (Phase J-2).
-- Additive only: document address snapshots on quotes and invoices.
-- Does not alter or reuse migration 0176.

ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "billing_address" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "site_address" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "postal_address" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "billing_address" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "site_address" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "postal_address" text;
