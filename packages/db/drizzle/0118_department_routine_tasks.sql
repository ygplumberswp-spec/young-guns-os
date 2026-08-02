DO $$ BEGIN
  CREATE TYPE "department_routine_task_status" AS ENUM(
    'pending',
    'in_progress',
    'completed',
    'overdue',
    'blocked',
    'awaiting_approval',
    'skipped'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "department_routine_task_cadence" AS ENUM('daily', 'weekly', 'monthly');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "department_routine_task_handoff_status" AS ENUM('pending', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "department_routine_task_audit_event" AS ENUM(
    'created',
    'status_changed',
    'completed',
    'skipped',
    'handoff',
    'approval_requested',
    'approved',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "department_routine_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "department_id" text NOT NULL,
  "routine_key" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "href" text NOT NULL,
  "cadence" "department_routine_task_cadence" NOT NULL,
  "accountable_owner" text NOT NULL,
  "assigned_user_id" uuid,
  "due_date" date NOT NULL,
  "period_start" date NOT NULL,
  "status" "department_routine_task_status" DEFAULT 'pending' NOT NULL,
  "requires_approval" boolean DEFAULT false NOT NULL,
  "approval_gate_id" text,
  "handoff_to_department_id" text,
  "handoff_status" "department_routine_task_handoff_status",
  "completed_at" timestamp with time zone,
  "completed_by_user_id" uuid,
  "skipped_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "department_routine_tasks" ADD CONSTRAINT "department_routine_tasks_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "department_routine_tasks" ADD CONSTRAINT "department_routine_tasks_assigned_user_id_users_id_fk"
  FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "department_routine_tasks" ADD CONSTRAINT "department_routine_tasks_completed_by_user_id_users_id_fk"
  FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "department_routine_tasks_dedupe_idx"
  ON "department_routine_tasks" ("company_id", "routine_key", "period_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "department_routine_tasks_company_dept_due_idx"
  ON "department_routine_tasks" ("company_id", "department_id", "due_date", "status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "department_routine_task_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "task_id" uuid NOT NULL,
  "event_type" "department_routine_task_audit_event" NOT NULL,
  "from_status" "department_routine_task_status",
  "to_status" "department_routine_task_status",
  "message" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "department_routine_task_audit_logs" ADD CONSTRAINT "department_routine_task_audit_logs_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "department_routine_task_audit_logs" ADD CONSTRAINT "department_routine_task_audit_logs_task_id_department_routine_tasks_id_fk"
  FOREIGN KEY ("task_id") REFERENCES "public"."department_routine_tasks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "department_routine_task_audit_logs" ADD CONSTRAINT "department_routine_task_audit_logs_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "department_routine_task_audit_logs_task_idx"
  ON "department_routine_task_audit_logs" ("task_id", "created_at");
