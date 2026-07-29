ALTER TYPE "public"."agent_key" ADD VALUE IF NOT EXISTS 'decision_intelligence';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_decision_report';--> statement-breakpoint
CREATE TYPE "public"."digital_twin_simulation_type" AS ENUM(
	'job_scheduling',
	'technician_allocation',
	'dispatch_optimization',
	'fleet_utilization',
	'inventory_demand',
	'purchasing',
	'cash_flow',
	'staffing',
	'customer_demand',
	'growth'
);--> statement-breakpoint
CREATE TYPE "public"."digital_twin_scenario_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."digital_twin_simulation_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."digital_twin_heat_map_type" AS ENUM(
	'technician_workload',
	'fleet_activity',
	'job_density',
	'customer_demand',
	'inventory_pressure',
	'financial_hotspots',
	'branch_performance'
);--> statement-breakpoint
CREATE TYPE "public"."digital_twin_recommendation_status" AS ENUM('pending', 'accepted', 'dismissed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."digital_twin_action_type" AS ENUM(
	'operational_improvement',
	'scenario_recommendation',
	'bottleneck_fix',
	'optimization_plan',
	'executive_recommendation'
);--> statement-breakpoint
CREATE TYPE "public"."digital_twin_action_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TYPE "public"."digital_twin_replay_event_type" AS ENUM(
	'job_event',
	'dispatch_event',
	'fleet_event',
	'inventory_event',
	'finance_event',
	'workflow_event',
	'decision_event'
);--> statement-breakpoint
CREATE TABLE "digital_twin_state_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"label" text,
	"operational_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text,
	"captured_by_user_id" uuid,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "digital_twin_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"simulation_type" "digital_twin_simulation_type" NOT NULL,
	"status" "digital_twin_scenario_status" DEFAULT 'draft' NOT NULL,
	"assumptions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"baseline_snapshot_id" uuid,
	"cloned_from_scenario_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "digital_twin_simulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"scenario_id" uuid NOT NULL,
	"simulation_type" "digital_twin_simulation_type" NOT NULL,
	"status" "digital_twin_simulation_status" DEFAULT 'pending' NOT NULL,
	"input_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"projected_outcomes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comparison_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_summary" text,
	"is_read_only" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "digital_twin_scenario_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scenario_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comparison_results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "digital_twin_replay_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"event_type" "digital_twin_replay_event_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"entity_type" text,
	"entity_id" uuid,
	"event_at" timestamp with time zone NOT NULL,
	"state_delta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "digital_twin_heat_map_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"heat_map_type" "digital_twin_heat_map_type" NOT NULL,
	"data_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "digital_twin_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"scenario_id" uuid,
	"title" text NOT NULL,
	"recommendation" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" "digital_twin_recommendation_status" DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "digital_twin_platform_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" "digital_twin_action_type" NOT NULL,
	"status" "digital_twin_action_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scenario_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "digital_twin_state_snapshots" ADD CONSTRAINT "digital_twin_state_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_state_snapshots" ADD CONSTRAINT "digital_twin_state_snapshots_captured_by_user_id_users_id_fk" FOREIGN KEY ("captured_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_scenarios" ADD CONSTRAINT "digital_twin_scenarios_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_scenarios" ADD CONSTRAINT "digital_twin_scenarios_baseline_snapshot_id_digital_twin_state_snapshots_id_fk" FOREIGN KEY ("baseline_snapshot_id") REFERENCES "public"."digital_twin_state_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_scenarios" ADD CONSTRAINT "digital_twin_scenarios_cloned_from_scenario_id_digital_twin_scenarios_id_fk" FOREIGN KEY ("cloned_from_scenario_id") REFERENCES "public"."digital_twin_scenarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_scenarios" ADD CONSTRAINT "digital_twin_scenarios_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_simulations" ADD CONSTRAINT "digital_twin_simulations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_simulations" ADD CONSTRAINT "digital_twin_simulations_scenario_id_digital_twin_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."digital_twin_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_simulations" ADD CONSTRAINT "digital_twin_simulations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_scenario_comparisons" ADD CONSTRAINT "digital_twin_scenario_comparisons_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_scenario_comparisons" ADD CONSTRAINT "digital_twin_scenario_comparisons_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_replay_events" ADD CONSTRAINT "digital_twin_replay_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_heat_map_snapshots" ADD CONSTRAINT "digital_twin_heat_map_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_recommendations" ADD CONSTRAINT "digital_twin_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_recommendations" ADD CONSTRAINT "digital_twin_recommendations_scenario_id_digital_twin_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."digital_twin_scenarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_platform_actions" ADD CONSTRAINT "digital_twin_platform_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_platform_actions" ADD CONSTRAINT "digital_twin_platform_actions_scenario_id_digital_twin_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."digital_twin_scenarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_platform_actions" ADD CONSTRAINT "digital_twin_platform_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "digital_twin_state_snapshots_company_captured_idx" ON "digital_twin_state_snapshots" ("company_id","captured_at");--> statement-breakpoint
CREATE INDEX "digital_twin_scenarios_company_status_idx" ON "digital_twin_scenarios" ("company_id","status");--> statement-breakpoint
CREATE INDEX "digital_twin_simulations_company_scenario_idx" ON "digital_twin_simulations" ("company_id","scenario_id");--> statement-breakpoint
CREATE INDEX "digital_twin_replay_events_company_event_at_idx" ON "digital_twin_replay_events" ("company_id","event_at");--> statement-breakpoint
CREATE INDEX "digital_twin_heat_map_snapshots_company_type_idx" ON "digital_twin_heat_map_snapshots" ("company_id","heat_map_type","captured_at");
