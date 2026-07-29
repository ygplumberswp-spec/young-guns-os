ALTER TYPE "public"."agent_key" ADD VALUE IF NOT EXISTS 'executive_operations';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_executive_briefing';--> statement-breakpoint
CREATE TYPE "public"."mission_control_alert_category" AS ENUM(
	'critical',
	'operational',
	'financial',
	'fleet',
	'inventory',
	'ai',
	'security',
	'integration'
);--> statement-breakpoint
CREATE TYPE "public"."mission_control_alert_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."mission_control_alert_status" AS ENUM('pending', 'acknowledged', 'escalated', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."mission_control_incident_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."mission_control_incident_status" AS ENUM('open', 'investigating', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."mission_control_timeline_event_type" AS ENUM(
	'job_event',
	'dispatch_event',
	'fleet_event',
	'finance_event',
	'workflow_event',
	'security_event',
	'integration_event',
	'ai_event',
	'executive_action',
	'incident_event'
);--> statement-breakpoint
CREATE TYPE "public"."mission_control_command_action_type" AS ENUM(
	'executive_task',
	'workflow_launch',
	'approval_request',
	'investigation',
	'incident_escalation',
	'department_coordination',
	'executive_briefing'
);--> statement-breakpoint
CREATE TYPE "public"."mission_control_command_action_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TYPE "public"."mission_control_recommendation_status" AS ENUM('pending', 'accepted', 'dismissed', 'completed');--> statement-breakpoint
CREATE TABLE "mission_control_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category" "mission_control_alert_category" NOT NULL,
	"severity" "mission_control_alert_severity" DEFAULT 'medium' NOT NULL,
	"status" "mission_control_alert_status" DEFAULT 'pending' NOT NULL,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"source_module" text,
	"source_entity_type" text,
	"source_entity_id" uuid,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"acknowledged_by_user_id" uuid,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "mission_control_alert_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"alert_id" uuid NOT NULL,
	"change_type" text NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"changed_by_user_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "mission_control_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" "mission_control_incident_severity" DEFAULT 'medium' NOT NULL,
	"status" "mission_control_incident_status" DEFAULT 'open' NOT NULL,
	"owner_user_id" uuid,
	"root_cause" text,
	"resolution_summary" text,
	"linked_entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"branch_key" text,
	"created_by_user_id" uuid NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "mission_control_incident_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "mission_control_operations_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"map_type" text NOT NULL,
	"label" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"entity_type" text,
	"entity_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "mission_control_timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"event_type" "mission_control_timeline_event_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source_module" text,
	"entity_type" text,
	"entity_id" uuid,
	"branch_key" text,
	"event_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "mission_control_department_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"department_key" text NOT NULL,
	"department_name" text NOT NULL,
	"health_score" integer,
	"status" text DEFAULT 'unknown' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "mission_control_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"recommendation" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" "mission_control_recommendation_status" DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "mission_control_command_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" "mission_control_command_action_type" NOT NULL,
	"status" "mission_control_command_action_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"incident_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "mission_control_alerts" ADD CONSTRAINT "mission_control_alerts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_alerts" ADD CONSTRAINT "mission_control_alerts_acknowledged_by_user_id_users_id_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_alert_history" ADD CONSTRAINT "mission_control_alert_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_alert_history" ADD CONSTRAINT "mission_control_alert_history_alert_id_mission_control_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."mission_control_alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_alert_history" ADD CONSTRAINT "mission_control_alert_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_incidents" ADD CONSTRAINT "mission_control_incidents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_incidents" ADD CONSTRAINT "mission_control_incidents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_incidents" ADD CONSTRAINT "mission_control_incidents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_incident_timeline" ADD CONSTRAINT "mission_control_incident_timeline_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_incident_timeline" ADD CONSTRAINT "mission_control_incident_timeline_incident_id_mission_control_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."mission_control_incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_incident_timeline" ADD CONSTRAINT "mission_control_incident_timeline_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_operations_map" ADD CONSTRAINT "mission_control_operations_map_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_timeline_events" ADD CONSTRAINT "mission_control_timeline_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_department_health" ADD CONSTRAINT "mission_control_department_health_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_recommendations" ADD CONSTRAINT "mission_control_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_command_actions" ADD CONSTRAINT "mission_control_command_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_command_actions" ADD CONSTRAINT "mission_control_command_actions_incident_id_mission_control_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."mission_control_incidents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_control_command_actions" ADD CONSTRAINT "mission_control_command_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mission_control_alerts_company_status_idx" ON "mission_control_alerts" ("company_id","status","severity");--> statement-breakpoint
CREATE INDEX "mission_control_incidents_company_status_idx" ON "mission_control_incidents" ("company_id","status","severity");--> statement-breakpoint
CREATE INDEX "mission_control_timeline_events_company_event_at_idx" ON "mission_control_timeline_events" ("company_id","event_at");--> statement-breakpoint
CREATE INDEX "mission_control_operations_map_company_captured_idx" ON "mission_control_operations_map" ("company_id","captured_at");
