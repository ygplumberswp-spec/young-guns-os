-- Phase J-6: finance documents no longer use user-entered titles.
-- Legacy column retained for Xero import compatibility; allow empty values.
-- Apply only after Owner-approved staging backup (do not auto-apply on deploy).

ALTER TABLE "quotes" ALTER COLUMN "title" DROP NOT NULL;
ALTER TABLE "quotes" ALTER COLUMN "title" SET DEFAULT '';

ALTER TABLE "invoices" ALTER COLUMN "title" DROP NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "title" SET DEFAULT '';
