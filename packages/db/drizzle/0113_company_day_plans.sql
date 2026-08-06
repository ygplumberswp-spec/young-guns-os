DO $$ BEGIN
  CREATE TYPE "company_day_plan_category" AS ENUM(
    'marketing',
    'communications',
    'operations',
    'finance',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "company_day_plan_priority" AS ENUM('normal', 'high');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "company_day_plan_status" AS ENUM('active', 'completed', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_day_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "plan_date" date NOT NULL,
  "content" text NOT NULL,
  "category" "company_day_plan_category",
  "priority" "company_day_plan_priority" DEFAULT 'normal' NOT NULL,
  "status" "company_day_plan_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_day_plans" ADD CONSTRAINT "company_day_plans_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_day_plans" ADD CONSTRAINT "company_day_plans_created_by_user_id_users_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_day_plans" ADD CONSTRAINT "company_day_plans_updated_by_user_id_users_id_fk"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_day_plans_company_date_idx"
  ON "company_day_plans" ("company_id", "plan_date", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_day_plans_dedupe_idx"
  ON "company_day_plans" (
    "company_id",
    "plan_date",
    lower(trim(regexp_replace("content", '\s+', ' ', 'g')))
  )
  WHERE "status" <> 'archived';
