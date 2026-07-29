CREATE TYPE "public"."agent_key" AS ENUM('executive', 'operations', 'finance', 'recruiting');--> statement-breakpoint
CREATE TYPE "public"."agent_profile_status" AS ENUM('draft', 'active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."agent_execution_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."agent_execution_mode" AS ENUM('manual', 'preview');--> statement-breakpoint
CREATE TABLE "agent_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"agent_key" "agent_key" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "agent_profile_status" DEFAULT 'draft' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_profile_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_profile_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_profile_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_profile_id" uuid NOT NULL,
	"tool_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_profile_id" uuid,
	"status" "agent_execution_status" DEFAULT 'pending' NOT NULL,
	"execution_mode" "agent_execution_mode" DEFAULT 'manual' NOT NULL,
	"input_summary" text,
	"output_summary" text,
	"error_message" text,
	"result_payload" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_profile_permissions" ADD CONSTRAINT "agent_profile_permissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_profile_permissions" ADD CONSTRAINT "agent_profile_permissions_agent_profile_id_agent_profiles_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "public"."agent_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_profile_tools" ADD CONSTRAINT "agent_profile_tools_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_profile_tools" ADD CONSTRAINT "agent_profile_tools_agent_profile_id_agent_profiles_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "public"."agent_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_agent_profile_id_agent_profiles_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "public"."agent_profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "agent_profiles_company_id_idx" ON "agent_profiles" USING btree ("company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_profiles_company_agent_key_idx" ON "agent_profiles" USING btree ("company_id", "agent_key");
--> statement-breakpoint
CREATE INDEX "agent_profile_permissions_company_id_idx" ON "agent_profile_permissions" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "agent_profile_permissions_profile_id_idx" ON "agent_profile_permissions" USING btree ("agent_profile_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_profile_permissions_profile_permission_idx" ON "agent_profile_permissions" USING btree ("agent_profile_id", "permission");
--> statement-breakpoint
CREATE INDEX "agent_profile_tools_company_id_idx" ON "agent_profile_tools" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "agent_profile_tools_profile_id_idx" ON "agent_profile_tools" USING btree ("agent_profile_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_profile_tools_profile_tool_key_idx" ON "agent_profile_tools" USING btree ("agent_profile_id", "tool_key");
--> statement-breakpoint
CREATE INDEX "agent_executions_company_id_idx" ON "agent_executions" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "agent_executions_profile_id_idx" ON "agent_executions" USING btree ("agent_profile_id");
--> statement-breakpoint
CREATE INDEX "agent_executions_started_at_idx" ON "agent_executions" USING btree ("company_id", "started_at");
