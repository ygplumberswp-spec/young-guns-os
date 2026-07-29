CREATE TYPE "public"."mobile_workforce_request_type" AS ENUM(
	'inventory_allocation',
	'inventory_request',
	'inventory_shortage',
	'overtime_request',
	'schedule_change',
	'general_request'
);--> statement-breakpoint
CREATE TYPE "public"."mobile_workforce_request_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TYPE "public"."mobile_time_entry_type" AS ENUM(
	'clock_in',
	'clock_out',
	'break_start',
	'break_end',
	'travel',
	'job_time'
);--> statement-breakpoint
CREATE TYPE "public"."mobile_documentation_type" AS ENUM(
	'photo',
	'video',
	'document',
	'inspection_form',
	'safety_checklist',
	'customer_signature'
);--> statement-breakpoint
CREATE TYPE "public"."mobile_inventory_usage_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed'
);--> statement-breakpoint
CREATE TYPE "public"."mobile_sync_conflict_status" AS ENUM(
	'pending',
	'resolved',
	'failed'
);--> statement-breakpoint
CREATE TABLE "mobile_workforce_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"request_type" "mobile_workforce_request_type" NOT NULL,
	"status" "mobile_workforce_request_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "mobile_time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_type" "mobile_time_entry_type" NOT NULL,
	"job_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_minutes" integer,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "mobile_job_inventory_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" "mobile_inventory_usage_status" DEFAULT 'pending_approval' NOT NULL,
	"scan_code" text,
	"notes" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "mobile_job_documentation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"documentation_type" "mobile_documentation_type" NOT NULL,
	"title" text NOT NULL,
	"file_name" text,
	"mime_type" text,
	"size_bytes" integer,
	"content" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "mobile_sync_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"queue_item_id" uuid,
	"resource_type" text NOT NULL,
	"resource_id" uuid,
	"client_version" text,
	"server_version" text,
	"client_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"server_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "mobile_sync_conflict_status" DEFAULT 'pending' NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "mobile_company_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"announcement_type" text DEFAULT 'general' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "mobile_workforce_requests" ADD CONSTRAINT "mobile_workforce_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_workforce_requests" ADD CONSTRAINT "mobile_workforce_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_time_entries" ADD CONSTRAINT "mobile_time_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_time_entries" ADD CONSTRAINT "mobile_time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_time_entries" ADD CONSTRAINT "mobile_time_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_job_inventory_usage" ADD CONSTRAINT "mobile_job_inventory_usage_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_job_inventory_usage" ADD CONSTRAINT "mobile_job_inventory_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_job_inventory_usage" ADD CONSTRAINT "mobile_job_inventory_usage_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_job_inventory_usage" ADD CONSTRAINT "mobile_job_inventory_usage_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_job_documentation" ADD CONSTRAINT "mobile_job_documentation_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_job_documentation" ADD CONSTRAINT "mobile_job_documentation_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_job_documentation" ADD CONSTRAINT "mobile_job_documentation_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_sync_conflicts" ADD CONSTRAINT "mobile_sync_conflicts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_sync_conflicts" ADD CONSTRAINT "mobile_sync_conflicts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_sync_conflicts" ADD CONSTRAINT "mobile_sync_conflicts_queue_item_id_mobile_sync_queue_id_fk" FOREIGN KEY ("queue_item_id") REFERENCES "public"."mobile_sync_queue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_company_announcements" ADD CONSTRAINT "mobile_company_announcements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_company_announcements" ADD CONSTRAINT "mobile_company_announcements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_sync_queue" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mobile_sync_queue" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "mobile_sync_queue" ADD COLUMN "client_version" text;--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'urgent_dispatch';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'inventory_request';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'company_announcement';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_mobile_request';--> statement-breakpoint
CREATE INDEX "mobile_workforce_requests_company_user_idx" ON "mobile_workforce_requests" ("company_id", "user_id");--> statement-breakpoint
CREATE INDEX "mobile_workforce_requests_status_idx" ON "mobile_workforce_requests" ("company_id", "status");--> statement-breakpoint
CREATE INDEX "mobile_time_entries_company_user_idx" ON "mobile_time_entries" ("company_id", "user_id");--> statement-breakpoint
CREATE INDEX "mobile_job_inventory_usage_job_idx" ON "mobile_job_inventory_usage" ("company_id", "job_id");--> statement-breakpoint
CREATE INDEX "mobile_job_documentation_job_idx" ON "mobile_job_documentation" ("company_id", "job_id");--> statement-breakpoint
CREATE INDEX "mobile_sync_conflicts_user_idx" ON "mobile_sync_conflicts" ("company_id", "user_id", "status");--> statement-breakpoint
CREATE INDEX "mobile_company_announcements_company_idx" ON "mobile_company_announcements" ("company_id", "is_active");
