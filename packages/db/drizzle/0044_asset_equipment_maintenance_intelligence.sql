CREATE TYPE "public"."asset_type" AS ENUM(
	'vehicle',
	'machinery',
	'tool',
	'equipment',
	'office_asset',
	'it_equipment',
	'rented_asset'
);--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM(
	'active',
	'inactive',
	'maintenance',
	'retired',
	'disposed',
	'out_of_service'
);--> statement-breakpoint
CREATE TYPE "public"."asset_condition" AS ENUM(
	'excellent',
	'good',
	'fair',
	'poor',
	'critical'
);--> statement-breakpoint
CREATE TYPE "public"."asset_lifecycle_event_type" AS ENUM(
	'acquisition',
	'assignment',
	'transfer',
	'maintenance',
	'repair',
	'calibration',
	'warranty',
	'retirement',
	'disposal'
);--> statement-breakpoint
CREATE TYPE "public"."asset_schedule_type" AS ENUM(
	'recurring',
	'usage_based',
	'inspection_reminder',
	'warranty_reminder',
	'service_interval'
);--> statement-breakpoint
CREATE TYPE "public"."asset_maintenance_type" AS ENUM(
	'planned',
	'emergency',
	'corrective',
	'preventative'
);--> statement-breakpoint
CREATE TYPE "public"."asset_maintenance_status" AS ENUM(
	'scheduled',
	'pending_approval',
	'approved',
	'in_progress',
	'completed',
	'cancelled'
);--> statement-breakpoint
CREATE TYPE "public"."asset_inspection_type" AS ENUM(
	'safety',
	'vehicle',
	'equipment',
	'toolbox',
	'compliance'
);--> statement-breakpoint
CREATE TYPE "public"."asset_inspection_status" AS ENUM(
	'scheduled',
	'in_progress',
	'passed',
	'failed',
	'overdue'
);--> statement-breakpoint
CREATE TYPE "public"."asset_calibration_status" AS ENUM(
	'valid',
	'expiring',
	'expired',
	'not_required'
);--> statement-breakpoint
CREATE TYPE "public"."asset_cost_type" AS ENUM(
	'maintenance',
	'repair',
	'downtime',
	'replacement',
	'warranty_recovery'
);--> statement-breakpoint
CREATE TYPE "public"."asset_action_type" AS ENUM(
	'maintenance_action',
	'replacement_recommendation'
);--> statement-breakpoint
CREATE TYPE "public"."asset_action_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TABLE "asset_equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"asset_type" "asset_type" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"serial_number" text,
	"barcode_reference" text,
	"vehicle_id" uuid,
	"supplier_id" uuid,
	"purchase_date" timestamp with time zone,
	"warranty_expires_at" timestamp with time zone,
	"depreciation_reference" text,
	"assigned_technician_id" uuid,
	"branch_key" text,
	"status" "asset_status" DEFAULT 'active' NOT NULL,
	"condition" "asset_condition" DEFAULT 'good' NOT NULL,
	"location_text" text,
	"photo_document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "asset_lifecycle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"event_type" "asset_lifecycle_event_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "asset_maintenance_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"schedule_type" "asset_schedule_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"interval_days" integer,
	"interval_usage_hours" integer,
	"next_due_at" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "asset_maintenance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"maintenance_type" "asset_maintenance_type" NOT NULL,
	"status" "asset_maintenance_status" DEFAULT 'pending_approval' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"assigned_technician_id" uuid,
	"job_id" uuid,
	"labour_cost_cents" integer DEFAULT 0 NOT NULL,
	"parts_cost_cents" integer DEFAULT 0 NOT NULL,
	"total_cost_cents" integer DEFAULT 0 NOT NULL,
	"downtime_hours" numeric(8, 2),
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "asset_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"inspection_type" "asset_inspection_type" NOT NULL,
	"status" "asset_inspection_status" DEFAULT 'scheduled' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"findings" text,
	"photo_document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inspector_user_id" uuid,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "asset_calibrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"certification_name" text NOT NULL,
	"calibrated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"testing_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"compliance_status" "asset_calibration_status" DEFAULT 'valid' NOT NULL,
	"renewal_recommendation" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "asset_maintenance_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"maintenance_record_id" uuid,
	"cost_type" "asset_cost_type" NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "asset_maintenance_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"asset_id" uuid,
	"action_type" "asset_action_type" NOT NULL,
	"status" "asset_action_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "asset_equipment" ADD CONSTRAINT "asset_equipment_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_equipment" ADD CONSTRAINT "asset_equipment_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_equipment" ADD CONSTRAINT "asset_equipment_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_equipment" ADD CONSTRAINT "asset_equipment_assigned_technician_id_users_id_fk" FOREIGN KEY ("assigned_technician_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_equipment" ADD CONSTRAINT "asset_equipment_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_lifecycle_events" ADD CONSTRAINT "asset_lifecycle_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_lifecycle_events" ADD CONSTRAINT "asset_lifecycle_events_asset_id_asset_equipment_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset_equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_lifecycle_events" ADD CONSTRAINT "asset_lifecycle_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_schedules" ADD CONSTRAINT "asset_maintenance_schedules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_schedules" ADD CONSTRAINT "asset_maintenance_schedules_asset_id_asset_equipment_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset_equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_records" ADD CONSTRAINT "asset_maintenance_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_records" ADD CONSTRAINT "asset_maintenance_records_asset_id_asset_equipment_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset_equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_records" ADD CONSTRAINT "asset_maintenance_records_assigned_technician_id_users_id_fk" FOREIGN KEY ("assigned_technician_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_records" ADD CONSTRAINT "asset_maintenance_records_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_records" ADD CONSTRAINT "asset_maintenance_records_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_inspections" ADD CONSTRAINT "asset_inspections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_inspections" ADD CONSTRAINT "asset_inspections_asset_id_asset_equipment_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset_equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_inspections" ADD CONSTRAINT "asset_inspections_inspector_user_id_users_id_fk" FOREIGN KEY ("inspector_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_calibrations" ADD CONSTRAINT "asset_calibrations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_calibrations" ADD CONSTRAINT "asset_calibrations_asset_id_asset_equipment_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset_equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_costs" ADD CONSTRAINT "asset_maintenance_costs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_costs" ADD CONSTRAINT "asset_maintenance_costs_asset_id_asset_equipment_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset_equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_costs" ADD CONSTRAINT "asset_maintenance_costs_maintenance_record_id_asset_maintenance_records_id_fk" FOREIGN KEY ("maintenance_record_id") REFERENCES "public"."asset_maintenance_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_actions" ADD CONSTRAINT "asset_maintenance_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_actions" ADD CONSTRAINT "asset_maintenance_actions_asset_id_asset_equipment_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset_equipment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_actions" ADD CONSTRAINT "asset_maintenance_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_equipment_company_idx" ON "asset_equipment" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "asset_lifecycle_events_asset_idx" ON "asset_lifecycle_events" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_maintenance_schedules_asset_idx" ON "asset_maintenance_schedules" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_maintenance_records_asset_idx" ON "asset_maintenance_records" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_inspections_asset_idx" ON "asset_inspections" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_calibrations_asset_idx" ON "asset_calibrations" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_maintenance_costs_asset_idx" ON "asset_maintenance_costs" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_maintenance_actions_company_idx" ON "asset_maintenance_actions" USING btree ("company_id");--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'asset_alert';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'maintenance_update';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_maintenance_action';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_asset_replacement';
