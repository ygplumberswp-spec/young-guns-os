CREATE TYPE "public"."vehicle_status" AS ENUM('available', 'in_use', 'maintenance', 'out_of_service');
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"make" text,
	"model" text,
	"year" integer,
	"license_plate" text NOT NULL,
	"vin" text,
	"status" "vehicle_status" DEFAULT 'available' NOT NULL,
	"assigned_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "vehicles_company_id_idx" ON "vehicles" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "vehicles_assigned_user_id_idx" ON "vehicles" USING btree ("assigned_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_company_license_plate_idx" ON "vehicles" USING btree ("company_id", "license_plate");
