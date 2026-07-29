ALTER TABLE "companies" ADD COLUMN "industry" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "business_type" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;
