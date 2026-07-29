CREATE TYPE "public"."integration_provider" AS ENUM('cartrack');
--> statement-breakpoint
CREATE TYPE "public"."integration_connection_status" AS ENUM('disconnected', 'pending', 'connected', 'error');
--> statement-breakpoint
CREATE TYPE "public"."integration_mapping_status" AS ENUM('unmapped', 'mapped', 'ignored');
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"status" "integration_connection_status" DEFAULT 'disconnected' NOT NULL,
	"credentials_encrypted" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_vehicle_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"integration_connection_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"external_vehicle_id" text NOT NULL,
	"external_registration" text,
	"external_name" text,
	"status" "integration_mapping_status" DEFAULT 'unmapped' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gps_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"integration_connection_id" uuid NOT NULL,
	"external_vehicle_id" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"speed_kmh" double precision,
	"heading" double precision,
	"recorded_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_payload" jsonb
);
--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "integration_vehicle_mappings" ADD CONSTRAINT "integration_vehicle_mappings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "integration_vehicle_mappings" ADD CONSTRAINT "integration_vehicle_mappings_integration_connection_id_integration_connections_id_fk" FOREIGN KEY ("integration_connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "integration_vehicle_mappings" ADD CONSTRAINT "integration_vehicle_mappings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gps_positions" ADD CONSTRAINT "gps_positions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gps_positions" ADD CONSTRAINT "gps_positions_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gps_positions" ADD CONSTRAINT "gps_positions_integration_connection_id_integration_connections_id_fk" FOREIGN KEY ("integration_connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "integration_connections_company_id_idx" ON "integration_connections" USING btree ("company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_company_provider_idx" ON "integration_connections" USING btree ("company_id", "provider");
--> statement-breakpoint
CREATE INDEX "integration_vehicle_mappings_company_id_idx" ON "integration_vehicle_mappings" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "integration_vehicle_mappings_vehicle_id_idx" ON "integration_vehicle_mappings" USING btree ("vehicle_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "integration_vehicle_mappings_connection_external_idx" ON "integration_vehicle_mappings" USING btree ("integration_connection_id", "external_vehicle_id");
--> statement-breakpoint
CREATE INDEX "gps_positions_company_vehicle_recorded_idx" ON "gps_positions" USING btree ("company_id", "vehicle_id", "recorded_at");
--> statement-breakpoint
CREATE INDEX "gps_positions_company_connection_external_idx" ON "gps_positions" USING btree ("company_id", "integration_connection_id", "external_vehicle_id");
