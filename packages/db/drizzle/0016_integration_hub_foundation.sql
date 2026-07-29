CREATE TYPE "public"."integration_sync_job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."integration_sync_job_type" AS ENUM('manual', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."integration_webhook_event_status" AS ENUM('received', 'processed', 'failed', 'ignored');--> statement-breakpoint
CREATE TABLE "integration_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"integration_connection_id" uuid,
	"provider" "integration_provider" NOT NULL,
	"job_type" "integration_sync_job_type" DEFAULT 'manual' NOT NULL,
	"status" "integration_sync_job_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"result_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"secret_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"webhook_endpoint_id" uuid,
	"provider" "integration_provider",
	"event_type" text NOT NULL,
	"status" "integration_webhook_event_status" DEFAULT 'received' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_sync_jobs" ADD CONSTRAINT "integration_sync_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "integration_sync_jobs" ADD CONSTRAINT "integration_sync_jobs_integration_connection_id_integration_connections_id_fk" FOREIGN KEY ("integration_connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "integration_webhook_endpoints" ADD CONSTRAINT "integration_webhook_endpoints_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "integration_webhook_events" ADD CONSTRAINT "integration_webhook_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "integration_webhook_events" ADD CONSTRAINT "integration_webhook_events_webhook_endpoint_id_integration_webhook_endpoints_id_fk" FOREIGN KEY ("webhook_endpoint_id") REFERENCES "public"."integration_webhook_endpoints"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "integration_sync_jobs_company_id_idx" ON "integration_sync_jobs" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "integration_sync_jobs_company_provider_started_idx" ON "integration_sync_jobs" USING btree ("company_id", "provider", "started_at");
--> statement-breakpoint
CREATE INDEX "integration_sync_jobs_connection_id_idx" ON "integration_sync_jobs" USING btree ("integration_connection_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "integration_webhook_endpoints_company_name_idx" ON "integration_webhook_endpoints" USING btree ("company_id", "name");
--> statement-breakpoint
CREATE INDEX "integration_webhook_endpoints_company_id_idx" ON "integration_webhook_endpoints" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "integration_webhook_events_company_id_idx" ON "integration_webhook_events" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "integration_webhook_events_company_received_idx" ON "integration_webhook_events" USING btree ("company_id", "received_at");
