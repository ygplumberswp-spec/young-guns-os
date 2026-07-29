ALTER TYPE "public"."integration_provider" ADD VALUE IF NOT EXISTS 'google_calendar';--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE IF NOT EXISTS 'google_maps';--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE IF NOT EXISTS 'microsoft_365';--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE IF NOT EXISTS 'resend';--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE IF NOT EXISTS 'custom';--> statement-breakpoint
CREATE TYPE "public"."integration_auth_type" AS ENUM('oauth', 'api_key', 'bearer_token', 'webhook_secret', 'basic_auth');--> statement-breakpoint
CREATE TYPE "public"."integration_health_status" AS ENUM('healthy', 'degraded', 'unhealthy', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."integration_log_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."integration_webhook_delivery_status" AS ENUM('pending', 'delivered', 'failed', 'dead_letter', 'retry');--> statement-breakpoint
CREATE TYPE "public"."integration_webhook_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TABLE "integration_registry_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"version" text,
	"auth_type" "integration_auth_type",
	"health_status" "integration_health_status" DEFAULT 'unknown' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone,
	"last_health_check_at" timestamp with time zone,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "integration_credential_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"connection_id" uuid,
	"auth_type" "integration_auth_type" NOT NULL,
	"credential_hint" text,
	"expires_at" timestamp with time zone,
	"last_validated_at" timestamp with time zone,
	"last_rotated_at" timestamp with time zone,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"rotation_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "integration_api_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" "integration_provider",
	"endpoint_key" text NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"avg_response_ms" integer,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "integration_health_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"health_status" "integration_health_status" NOT NULL,
	"auth_healthy" boolean DEFAULT false NOT NULL,
	"api_available" boolean DEFAULT false NOT NULL,
	"webhook_healthy" boolean DEFAULT false NOT NULL,
	"avg_latency_ms" integer,
	"summary" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "integration_request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" "integration_provider",
	"direction" "integration_log_direction" NOT NULL,
	"method" text,
	"endpoint" text NOT NULL,
	"status_code" integer,
	"duration_ms" integer,
	"error_message" text,
	"request_summary" text,
	"response_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "integration_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"webhook_endpoint_id" uuid,
	"direction" "integration_webhook_direction" NOT NULL,
	"status" "integration_webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"event_type" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"payload_summary" text,
	"error_message" text,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "integration_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" "integration_provider",
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "developer_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "integration_registry_settings" ADD CONSTRAINT "integration_registry_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credential_metadata" ADD CONSTRAINT "integration_credential_metadata_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credential_metadata" ADD CONSTRAINT "integration_credential_metadata_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_api_usage" ADD CONSTRAINT "integration_api_usage_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_health_snapshots" ADD CONSTRAINT "integration_health_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_request_logs" ADD CONSTRAINT "integration_request_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_webhook_deliveries" ADD CONSTRAINT "integration_webhook_deliveries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_webhook_deliveries" ADD CONSTRAINT "integration_webhook_deliveries_webhook_endpoint_id_integration_webhook_endpoints_id_fk" FOREIGN KEY ("webhook_endpoint_id") REFERENCES "public"."integration_webhook_endpoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_recommendations" ADD CONSTRAINT "integration_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_webhook_endpoints" ADD COLUMN "direction" "integration_webhook_direction" DEFAULT 'inbound' NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_webhook_endpoints" ADD COLUMN "target_url" text;--> statement-breakpoint
ALTER TABLE "developer_api_keys" ADD CONSTRAINT "developer_api_keys_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_api_keys" ADD CONSTRAINT "developer_api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_integration_action';--> statement-breakpoint
CREATE UNIQUE INDEX "integration_registry_settings_company_provider_idx" ON "integration_registry_settings" ("company_id", "provider");--> statement-breakpoint
CREATE INDEX "integration_api_usage_company_period_idx" ON "integration_api_usage" ("company_id", "period_start");--> statement-breakpoint
CREATE INDEX "integration_request_logs_company_created_idx" ON "integration_request_logs" ("company_id", "created_at");--> statement-breakpoint
CREATE INDEX "integration_webhook_deliveries_company_status_idx" ON "integration_webhook_deliveries" ("company_id", "status");--> statement-breakpoint
CREATE UNIQUE INDEX "developer_api_keys_company_name_idx" ON "developer_api_keys" ("company_id", "name");
