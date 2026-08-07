DO $$ BEGIN
 CREATE TYPE "public"."xero_write_approval_status" AS ENUM('pending', 'approved', 'rejected', 'executed', 'expired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "xero_write_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"write_operation" text NOT NULL,
	"status" "xero_write_approval_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "xero_write_approvals" ADD CONSTRAINT "xero_write_approvals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "xero_write_approvals" ADD CONSTRAINT "xero_write_approvals_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "xero_write_approvals_idempotency_uq" ON "xero_write_approvals" USING btree ("company_id","idempotency_key");
--> statement-breakpoint
ALTER TABLE "xero_invoice_mappings" ADD COLUMN IF NOT EXISTS "conflict_metadata" jsonb;
--> statement-breakpoint
ALTER TABLE "xero_customer_mappings" ADD COLUMN IF NOT EXISTS "conflict_metadata" jsonb;
--> statement-breakpoint
ALTER TABLE "xero_payment_mappings" ADD COLUMN IF NOT EXISTS "conflict_metadata" jsonb;
