CREATE TYPE "public"."quality_comeback_type" AS ENUM(
	'callback',
	'revisit',
	'warranty_visit',
	'quality_inspection'
);--> statement-breakpoint
CREATE TYPE "public"."quality_comeback_status" AS ENUM(
	'open',
	'investigating',
	'resolved',
	'closed',
	'cancelled'
);--> statement-breakpoint
CREATE TYPE "public"."quality_root_cause" AS ENUM(
	'installation_error',
	'workmanship',
	'wrong_diagnosis',
	'incorrect_materials',
	'defective_materials',
	'manufacturer_defect',
	'customer_misuse',
	'unrelated_new_fault',
	'wear_and_tear',
	'warranty',
	'unknown'
);--> statement-breakpoint
CREATE TYPE "public"."quality_action_type" AS ENUM(
	'coaching',
	'retraining',
	'warning',
	'labour_recovery',
	'material_recovery',
	'payroll_recommendation'
);--> statement-breakpoint
CREATE TYPE "public"."quality_action_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TABLE "quality_comebacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"comeback_type" "quality_comeback_type" NOT NULL,
	"status" "quality_comeback_status" DEFAULT 'open' NOT NULL,
	"original_job_id" uuid NOT NULL,
	"comeback_job_id" uuid,
	"original_technician_id" uuid,
	"current_technician_id" uuid,
	"customer_id" uuid NOT NULL,
	"branch_key" text,
	"reason" text NOT NULL,
	"resolution" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"labour_hours" numeric(8, 2),
	"photo_document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "quality_root_cause_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"comeback_id" uuid NOT NULL,
	"classification" "quality_root_cause" NOT NULL,
	"notes" text,
	"aura_recommended_cause" "quality_root_cause",
	"aura_confidence" numeric(5, 2),
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "quality_cost_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"comeback_id" uuid NOT NULL,
	"labour_cost_cents" integer DEFAULT 0 NOT NULL,
	"material_cost_cents" integer DEFAULT 0 NOT NULL,
	"travel_cost_cents" integer DEFAULT 0 NOT NULL,
	"total_comeback_cost_cents" integer DEFAULT 0 NOT NULL,
	"warranty_cost_cents" integer DEFAULT 0 NOT NULL,
	"supplier_recovery_cents" integer DEFAULT 0 NOT NULL,
	"company_loss_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "quality_warranty_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"comeback_id" uuid,
	"job_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "quality_comeback_status" DEFAULT 'open' NOT NULL,
	"claim_number" text,
	"description" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "quality_supplier_defects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"supplier_id" uuid,
	"inventory_item_id" uuid,
	"comeback_id" uuid,
	"defect_description" text NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"warranty_claim_id" uuid,
	"replacement_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "quality_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" "quality_action_type" NOT NULL,
	"status" "quality_action_status" DEFAULT 'pending_approval' NOT NULL,
	"technician_id" uuid,
	"comeback_id" uuid,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "parent_job_id" uuid;--> statement-breakpoint
ALTER TABLE "quality_comebacks" ADD CONSTRAINT "quality_comebacks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_comebacks" ADD CONSTRAINT "quality_comebacks_original_job_id_jobs_id_fk" FOREIGN KEY ("original_job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_comebacks" ADD CONSTRAINT "quality_comebacks_comeback_job_id_jobs_id_fk" FOREIGN KEY ("comeback_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_comebacks" ADD CONSTRAINT "quality_comebacks_original_technician_id_users_id_fk" FOREIGN KEY ("original_technician_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_comebacks" ADD CONSTRAINT "quality_comebacks_current_technician_id_users_id_fk" FOREIGN KEY ("current_technician_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_comebacks" ADD CONSTRAINT "quality_comebacks_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_comebacks" ADD CONSTRAINT "quality_comebacks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_root_cause_analyses" ADD CONSTRAINT "quality_root_cause_analyses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_root_cause_analyses" ADD CONSTRAINT "quality_root_cause_analyses_comeback_id_quality_comebacks_id_fk" FOREIGN KEY ("comeback_id") REFERENCES "public"."quality_comebacks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_root_cause_analyses" ADD CONSTRAINT "quality_root_cause_analyses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_cost_entries" ADD CONSTRAINT "quality_cost_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_cost_entries" ADD CONSTRAINT "quality_cost_entries_comeback_id_quality_comebacks_id_fk" FOREIGN KEY ("comeback_id") REFERENCES "public"."quality_comebacks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_warranty_claims" ADD CONSTRAINT "quality_warranty_claims_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_warranty_claims" ADD CONSTRAINT "quality_warranty_claims_comeback_id_quality_comebacks_id_fk" FOREIGN KEY ("comeback_id") REFERENCES "public"."quality_comebacks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_warranty_claims" ADD CONSTRAINT "quality_warranty_claims_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_warranty_claims" ADD CONSTRAINT "quality_warranty_claims_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_supplier_defects" ADD CONSTRAINT "quality_supplier_defects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_supplier_defects" ADD CONSTRAINT "quality_supplier_defects_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_supplier_defects" ADD CONSTRAINT "quality_supplier_defects_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_supplier_defects" ADD CONSTRAINT "quality_supplier_defects_comeback_id_quality_comebacks_id_fk" FOREIGN KEY ("comeback_id") REFERENCES "public"."quality_comebacks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_supplier_defects" ADD CONSTRAINT "quality_supplier_defects_warranty_claim_id_quality_warranty_claims_id_fk" FOREIGN KEY ("warranty_claim_id") REFERENCES "public"."quality_warranty_claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_actions" ADD CONSTRAINT "quality_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_actions" ADD CONSTRAINT "quality_actions_technician_id_users_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_actions" ADD CONSTRAINT "quality_actions_comeback_id_quality_comebacks_id_fk" FOREIGN KEY ("comeback_id") REFERENCES "public"."quality_comebacks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_actions" ADD CONSTRAINT "quality_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_parent_job_id_jobs_id_fk" FOREIGN KEY ("parent_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'quality_alert';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'comeback_update';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'warranty_update';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_quality_action';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_quality_review';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_payroll_recommendation';--> statement-breakpoint
CREATE INDEX "quality_comebacks_company_status_idx" ON "quality_comebacks" ("company_id", "status");--> statement-breakpoint
CREATE INDEX "quality_comebacks_original_job_idx" ON "quality_comebacks" ("company_id", "original_job_id");--> statement-breakpoint
CREATE INDEX "quality_comebacks_technician_idx" ON "quality_comebacks" ("company_id", "original_technician_id");--> statement-breakpoint
CREATE INDEX "quality_warranty_claims_company_idx" ON "quality_warranty_claims" ("company_id", "status");--> statement-breakpoint
CREATE INDEX "quality_actions_company_status_idx" ON "quality_actions" ("company_id", "status");
