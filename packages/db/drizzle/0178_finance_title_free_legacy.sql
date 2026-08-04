-- Phase J-6.1: legacy title column stays NOT NULL with empty-string default.
-- Application layer hides titles from users; never inserts "Untitled".
-- Apply only via apply-0178-staging-only.mjs after Owner-approved staging backup.

UPDATE "quotes" SET "title" = '' WHERE "title" IS NULL;
--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "title" SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "title" SET NOT NULL;
--> statement-breakpoint
UPDATE "invoices" SET "title" = '' WHERE "title" IS NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "title" SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "title" SET NOT NULL;
