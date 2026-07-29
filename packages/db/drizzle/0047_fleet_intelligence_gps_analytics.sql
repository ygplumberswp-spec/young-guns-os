CREATE TYPE "public"."fleet_cost_type" AS ENUM(
	'fuel',
	'maintenance',
	'tyre',
	'licensing',
	'insurance',
	'repair',
	'other'
);--> statement-breakpoint
CREATE TYPE "public"."fleet_recommendation_type" AS ENUM(
	'maintenance_planning',
	'route_optimization',
	'vehicle_replacement',
	'fleet_balancing',
	'technician_allocation',
	'operating_cost_reduction',
	'excessive_travel_reduction',
	'comeback_travel_reduction'
);--> statement-breakpoint
CREATE TYPE "public"."fleet_behaviour_event_type" AS ENUM(
	'speeding',
	'harsh_braking',
	'harsh_acceleration',
	'excessive_idling',
	'route_deviation'
);--> statement-breakpoint
CREATE TYPE "public"."fleet_action_type" AS ENUM('fleet_action', 'vehicle_replacement');--> statement-breakpoint
CREATE TYPE "public"."fleet_action_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TABLE "fleet_monthly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"total_kilometres" integer DEFAULT 0 NOT NULL,
	"total_trips" integer DEFAULT 0 NOT NULL,
	"driving_hours" integer DEFAULT 0 NOT NULL,
	"idle_hours" integer DEFAULT 0 NOT NULL,
	"average_trip_distance_km" integer,
	"average_trip_duration_minutes" integer,
	"vehicle_summaries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"export_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "fleet_driver_behaviour_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"event_type" "fleet_behaviour_event_type" NOT NULL,
	"severity" integer DEFAULT 1 NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "fleet_operating_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"cost_type" "fleet_cost_type" NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"notes" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "fleet_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"recommendation_type" "fleet_recommendation_type" NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"vehicle_id" uuid,
	"branch_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "fleet_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" "fleet_action_type" NOT NULL,
	"status" "fleet_action_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"vehicle_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "fleet_monthly_reports" ADD CONSTRAINT "fleet_monthly_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_driver_behaviour_events" ADD CONSTRAINT "fleet_driver_behaviour_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_driver_behaviour_events" ADD CONSTRAINT "fleet_driver_behaviour_events_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_operating_costs" ADD CONSTRAINT "fleet_operating_costs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_operating_costs" ADD CONSTRAINT "fleet_operating_costs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_operating_costs" ADD CONSTRAINT "fleet_operating_costs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_recommendations" ADD CONSTRAINT "fleet_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_recommendations" ADD CONSTRAINT "fleet_recommendations_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_actions" ADD CONSTRAINT "fleet_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_actions" ADD CONSTRAINT "fleet_actions_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_actions" ADD CONSTRAINT "fleet_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fleet_monthly_reports_company_idx" ON "fleet_monthly_reports" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "fleet_driver_behaviour_events_company_idx" ON "fleet_driver_behaviour_events" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "fleet_operating_costs_company_idx" ON "fleet_operating_costs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "fleet_recommendations_company_idx" ON "fleet_recommendations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "fleet_actions_company_idx" ON "fleet_actions" USING btree ("company_id");--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'fleet_alert';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_fleet_action';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_vehicle_replacement';
