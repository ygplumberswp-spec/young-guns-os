DO $$ BEGIN
  CREATE TYPE "company_day_plan_follow_up_priority" AS ENUM('low', 'medium', 'high');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "company_day_plan_follow_up_status" AS ENUM(
    'draft',
    'pending_review',
    'approved',
    'declined',
    'assigned',
    'completed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_day_plan_follow_ups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "plan_date" date NOT NULL,
  "reason" text NOT NULL,
  "responsible_agent" text,
  "priority" "company_day_plan_follow_up_priority" DEFAULT 'medium' NOT NULL,
  "status" "company_day_plan_follow_up_status" DEFAULT 'draft' NOT NULL,
  "next_action" text,
  "merged_source_count" integer DEFAULT 1 NOT NULL,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "assigned_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_day_plan_follow_ups" ADD CONSTRAINT "company_day_plan_follow_ups_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_day_plan_follow_ups" ADD CONSTRAINT "company_day_plan_follow_ups_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_day_plan_follow_ups" ADD CONSTRAINT "company_day_plan_follow_ups_created_by_user_id_users_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_day_plan_follow_ups" ADD CONSTRAINT "company_day_plan_follow_ups_updated_by_user_id_users_id_fk"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_day_plan_follow_ups" ADD CONSTRAINT "company_day_plan_follow_ups_assigned_user_id_users_id_fk"
  FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_day_plan_follow_ups_customer_day_idx"
  ON "company_day_plan_follow_ups" ("company_id", "plan_date", "customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_day_plan_follow_ups_company_date_status_idx"
  ON "company_day_plan_follow_ups" ("company_id", "plan_date", "status");
