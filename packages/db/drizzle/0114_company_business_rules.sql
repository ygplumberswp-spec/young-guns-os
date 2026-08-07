DO $$ BEGIN
  CREATE TYPE "business_rule_type" AS ENUM('always_follow', 'scheduled', 'approval');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "business_rule_category" AS ENUM(
    'company_wide',
    'finance',
    'sales',
    'marketing',
    'operations',
    'customers',
    'workforce_payroll',
    'fleet',
    'stock_suppliers',
    'compliance'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "business_rule_status" AS ENUM('active', 'paused', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "business_rule_task_status" AS ENUM('pending', 'completed', 'skipped', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_business_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "department" text,
  "instruction" text NOT NULL,
  "rule_type" "business_rule_type" DEFAULT 'always_follow' NOT NULL,
  "category" "business_rule_category" DEFAULT 'company_wide' NOT NULL,
  "frequency_cron" text,
  "assigned_agent_role" text,
  "approval_required" boolean DEFAULT false NOT NULL,
  "approval_type" text,
  "status" "business_rule_status" DEFAULT 'active' NOT NULL,
  "next_scheduled_at" timestamp with time zone,
  "last_completed_at" timestamp with time zone,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_business_rules" ADD CONSTRAINT "company_business_rules_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_business_rules" ADD CONSTRAINT "company_business_rules_created_by_user_id_users_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_business_rules" ADD CONSTRAINT "company_business_rules_updated_by_user_id_users_id_fk"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_business_rules_company_status_idx"
  ON "company_business_rules" ("company_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_business_rules_dedupe_idx"
  ON "company_business_rules" (
    "company_id",
    lower(trim(regexp_replace("instruction", '\s+', ' ', 'g')))
  )
  WHERE "status" <> 'archived';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "business_rule_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "business_rule_id" uuid NOT NULL,
  "task_date" date NOT NULL,
  "status" "business_rule_task_status" DEFAULT 'pending' NOT NULL,
  "next_run" timestamp with time zone,
  "last_run" timestamp with time zone,
  "day_plan_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_rule_tasks" ADD CONSTRAINT "business_rule_tasks_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_rule_tasks" ADD CONSTRAINT "business_rule_tasks_business_rule_id_fk"
  FOREIGN KEY ("business_rule_id") REFERENCES "public"."company_business_rules"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "business_rule_tasks_company_date_idx"
  ON "business_rule_tasks" ("company_id", "task_date", "status");
--> statement-breakpoint
ALTER TABLE "agent_executions" ADD COLUMN IF NOT EXISTS "business_rule_id" uuid;
--> statement-breakpoint
ALTER TABLE "agent_executions" ADD COLUMN IF NOT EXISTS "day_plan_id" uuid;
