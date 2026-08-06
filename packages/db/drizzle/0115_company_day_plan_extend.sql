DO $$ BEGIN
  CREATE TYPE "company_day_plan_source" AS ENUM('manual', 'aura_suggested', 'business_rule');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "company_day_plans" ADD COLUMN IF NOT EXISTS "department" text;
--> statement-breakpoint
ALTER TABLE "company_day_plans" ADD COLUMN IF NOT EXISTS "assigned_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "company_day_plans" ADD COLUMN IF NOT EXISTS "assigned_agent_role" text;
--> statement-breakpoint
ALTER TABLE "company_day_plans" ADD COLUMN IF NOT EXISTS "due_time" time;
--> statement-breakpoint
ALTER TABLE "company_day_plans" ADD COLUMN IF NOT EXISTS "progress_pct" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "company_day_plans" ADD COLUMN IF NOT EXISTS "approval_required" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "company_day_plans" ADD COLUMN IF NOT EXISTS "source" "company_day_plan_source" DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "company_day_plans" ADD COLUMN IF NOT EXISTS "business_rule_id" uuid;
--> statement-breakpoint
ALTER TABLE "company_day_plans" ADD CONSTRAINT "company_day_plans_assigned_user_id_users_id_fk"
  FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_day_plans" ADD CONSTRAINT "company_day_plans_business_rule_id_fk"
  FOREIGN KEY ("business_rule_id") REFERENCES "public"."company_business_rules"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_rule_tasks" ADD CONSTRAINT "business_rule_tasks_day_plan_id_fk"
  FOREIGN KEY ("day_plan_id") REFERENCES "public"."company_day_plans"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_business_rule_id_fk"
  FOREIGN KEY ("business_rule_id") REFERENCES "public"."company_business_rules"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_day_plan_id_fk"
  FOREIGN KEY ("day_plan_id") REFERENCES "public"."company_day_plans"("id") ON DELETE set null ON UPDATE no action;
