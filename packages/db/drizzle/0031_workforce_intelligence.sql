ALTER TYPE "public"."recruiting_status" ADD VALUE IF NOT EXISTS 'applied';--> statement-breakpoint
ALTER TYPE "public"."recruiting_status" ADD VALUE IF NOT EXISTS 'assessment';--> statement-breakpoint
ALTER TYPE "public"."recruiting_status" ADD VALUE IF NOT EXISTS 'offer';--> statement-breakpoint
ALTER TYPE "public"."recruiting_status" ADD VALUE IF NOT EXISTS 'hired';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_recruitment_action';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_candidate_communication';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_interview_request';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_training_plan';--> statement-breakpoint
CREATE TYPE "public"."candidate_activity_type" AS ENUM('note', 'screening', 'interview', 'assessment', 'communication', 'status_change', 'other');--> statement-breakpoint
CREATE TYPE "public"."workforce_recommendation_type" AS ENUM('staffing', 'training', 'recruitment', 'capacity', 'skill_gap', 'performance');--> statement-breakpoint
CREATE TYPE "public"."workforce_recommendation_status" AS ENUM('pending', 'accepted', 'dismissed', 'completed');--> statement-breakpoint
ALTER TABLE "recruiting_candidates" ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint
ALTER TABLE "recruiting_candidates" ADD COLUMN IF NOT EXISTS "skills" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE TABLE "candidate_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"activity_type" "candidate_activity_type" DEFAULT 'note' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"author_user_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "employee_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_key" text NOT NULL,
	"skill_name" text NOT NULL,
	"proficiency" text DEFAULT 'intermediate' NOT NULL,
	"experience_years" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"certification_key" text NOT NULL,
	"name" text NOT NULL,
	"issuer" text,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "training_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"training_key" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "workforce_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"recommendation_type" "workforce_recommendation_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" "workforce_recommendation_status" DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "candidate_activities" ADD CONSTRAINT "candidate_activities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_activities" ADD CONSTRAINT "candidate_activities_candidate_id_recruiting_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."recruiting_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_activities" ADD CONSTRAINT "candidate_activities_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_skills" ADD CONSTRAINT "employee_skills_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_skills" ADD CONSTRAINT "employee_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_recommendations" ADD CONSTRAINT "workforce_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_activities_company_id_idx" ON "candidate_activities" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "candidate_activities_candidate_id_idx" ON "candidate_activities" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "employee_skills_company_id_idx" ON "employee_skills" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_skills_user_id_idx" ON "employee_skills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "certifications_company_id_idx" ON "certifications" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "certifications_user_id_idx" ON "certifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "training_records_company_id_idx" ON "training_records" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "training_records_user_id_idx" ON "training_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workforce_recommendations_company_id_idx" ON "workforce_recommendations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "workforce_recommendations_company_status_idx" ON "workforce_recommendations" USING btree ("company_id","status");
