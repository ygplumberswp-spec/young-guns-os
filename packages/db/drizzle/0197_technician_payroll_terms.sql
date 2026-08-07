-- Effective-dated technician monthly salary / working hours / overtime terms.
-- Salary is private payroll truth; job labour uses derived hourly allocation only.
CREATE TABLE IF NOT EXISTS "technician_payroll_terms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "monthly_salary_cents" integer NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "working_days_per_week" numeric(4, 2) DEFAULT '5' NOT NULL,
  "working_hours_per_day" numeric(4, 2) DEFAULT '8' NOT NULL,
  "overtime_daily_threshold_hours" numeric(4, 2) DEFAULT '8' NOT NULL,
  "overtime_multiplier_bps" integer DEFAULT 15000 NOT NULL,
  "payroll_reference" text,
  "notes" text,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "technician_payroll_terms_company_user_idx"
  ON "technician_payroll_terms" ("company_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "technician_payroll_terms_company_user_from_idx"
  ON "technician_payroll_terms" ("company_id", "user_id", "effective_from");
--> statement-breakpoint
-- At most one open-ended current term per technician.
CREATE UNIQUE INDEX IF NOT EXISTS "technician_payroll_terms_open_term_uidx"
  ON "technician_payroll_terms" ("company_id", "user_id")
  WHERE "effective_to" IS NULL;
--> statement-breakpoint
ALTER TABLE "user_invites"
  ADD COLUMN IF NOT EXISTS "payroll_setup" jsonb;
--> statement-breakpoint
