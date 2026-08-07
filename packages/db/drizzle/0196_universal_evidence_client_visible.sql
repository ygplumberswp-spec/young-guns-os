-- Universal evidence: explicit client visibility (default OFF — never auto-expose internal slips/receipts).
ALTER TABLE "mobile_job_documentation"
  ADD COLUMN IF NOT EXISTS "client_visible" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "mobile_job_documentation"
  ADD COLUMN IF NOT EXISTS "attachment_category" text;
--> statement-breakpoint
