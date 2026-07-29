ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_knowledge_article';--> statement-breakpoint
CREATE TYPE "public"."knowledge_article_type" AS ENUM('article', 'procedure', 'documentation', 'troubleshooting', 'technical_reference', 'internal_note', 'faq');--> statement-breakpoint
CREATE TYPE "public"."knowledge_content_status" AS ENUM('draft', 'pending_approval', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."knowledge_entity_type" AS ENUM('article', 'sop', 'policy');--> statement-breakpoint
CREATE TYPE "public"."policy_type" AS ENUM('safety', 'hr', 'operational', 'financial', 'compliance');--> statement-breakpoint
CREATE TYPE "public"."training_content_type" AS ENUM('video', 'pdf', 'manual', 'article', 'other');--> statement-breakpoint
CREATE TYPE "public"."training_course_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."training_record_status" AS ENUM('not_started', 'in_progress', 'completed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."knowledge_recommendation_type" AS ENUM('missing_documentation', 'outdated_sop', 'expired_certification', 'training_requirement', 'frequently_requested');--> statement-breakpoint
CREATE TYPE "public"."knowledge_recommendation_status" AS ENUM('pending', 'accepted', 'dismissed', 'completed');--> statement-breakpoint
CREATE TABLE "knowledge_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category_id" uuid,
	"article_type" "knowledge_article_type" DEFAULT 'article' NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "knowledge_content_status" DEFAULT 'draft' NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"document_id" uuid,
	"related_article_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"approved_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"entity_type" "knowledge_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"change_summary" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "sop_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category_id" uuid,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"department" text,
	"status" "knowledge_content_status" DEFAULT 'draft' NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"effective_date" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"approved_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "training_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"content_type" "training_content_type" DEFAULT 'article' NOT NULL,
	"content_url" text,
	"document_id" uuid,
	"skill_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"certification_required" boolean DEFAULT false NOT NULL,
	"certification_valid_days" integer,
	"status" "training_course_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_training_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "training_record_status" DEFAULT 'not_started' NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"certification_expires_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "company_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category_id" uuid,
	"policy_type" "policy_type" NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"status" "knowledge_content_status" DEFAULT 'draft' NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"effective_date" timestamp with time zone,
	"expiry_date" timestamp with time zone,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"approved_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"recommendation_type" "knowledge_recommendation_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" "knowledge_recommendation_status" DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "knowledge_categories" ADD CONSTRAINT "knowledge_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_category_id_knowledge_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."knowledge_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_documents" ADD CONSTRAINT "sop_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_documents" ADD CONSTRAINT "sop_documents_category_id_knowledge_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."knowledge_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_documents" ADD CONSTRAINT "sop_documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_documents" ADD CONSTRAINT "sop_documents_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_courses" ADD CONSTRAINT "training_courses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_courses" ADD CONSTRAINT "training_courses_category_id_knowledge_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."knowledge_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_courses" ADD CONSTRAINT "training_courses_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_courses" ADD CONSTRAINT "training_courses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_training_records" ADD CONSTRAINT "knowledge_training_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_training_records" ADD CONSTRAINT "knowledge_training_records_course_id_training_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."training_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_training_records" ADD CONSTRAINT "knowledge_training_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_policies" ADD CONSTRAINT "company_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_policies" ADD CONSTRAINT "company_policies_category_id_knowledge_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."knowledge_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_policies" ADD CONSTRAINT "company_policies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_policies" ADD CONSTRAINT "company_policies_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_recommendations" ADD CONSTRAINT "knowledge_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_categories_company_id_idx" ON "knowledge_categories" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "knowledge_articles_company_id_idx" ON "knowledge_articles" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "knowledge_articles_company_status_idx" ON "knowledge_articles" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_versions_entity_idx" ON "knowledge_versions" USING btree ("company_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "sop_documents_company_id_idx" ON "sop_documents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "sop_documents_company_status_idx" ON "sop_documents" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "training_courses_company_id_idx" ON "training_courses" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "knowledge_training_records_company_user_idx" ON "knowledge_training_records" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "knowledge_training_records_course_id_idx" ON "knowledge_training_records" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "company_policies_company_id_idx" ON "company_policies" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_policies_company_status_idx" ON "company_policies" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_recommendations_company_id_idx" ON "knowledge_recommendations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "knowledge_recommendations_company_status_idx" ON "knowledge_recommendations" USING btree ("company_id","status");
