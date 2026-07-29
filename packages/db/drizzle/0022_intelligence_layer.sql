CREATE TYPE "public"."aura_memory_category" AS ENUM('business_rule', 'preference', 'process', 'note');--> statement-breakpoint
CREATE TABLE "aura_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"category" "aura_memory_category" DEFAULT 'business_rule' NOT NULL,
	"information" text NOT NULL,
	"importance" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "aura_memory" ADD CONSTRAINT "aura_memory_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aura_memory" ADD CONSTRAINT "aura_memory_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aura_memory_company_id_idx" ON "aura_memory" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "aura_memory_company_category_idx" ON "aura_memory" USING btree ("company_id", "category");--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE 'store_memory';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE 'draft_hiring_recommendation';
