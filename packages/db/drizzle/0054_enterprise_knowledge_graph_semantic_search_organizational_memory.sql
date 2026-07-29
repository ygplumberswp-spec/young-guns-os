ALTER TYPE "public"."agent_key" ADD VALUE IF NOT EXISTS 'knowledge';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_knowledge_report';--> statement-breakpoint
CREATE TYPE "public"."knowledge_graph_entity_type" AS ENUM(
	'customer',
	'job',
	'asset',
	'invoice',
	'inventory',
	'vehicle',
	'technician',
	'supplier',
	'document',
	'communication',
	'workflow',
	'ai_agent',
	'integration',
	'quote',
	'payment',
	'analytics_report',
	'digital_twin_snapshot',
	'organizational_memory'
);--> statement-breakpoint
CREATE TYPE "public"."knowledge_graph_relationship_type" AS ENUM(
	'assigned_to',
	'belongs_to',
	'related_to',
	'depends_on',
	'created_by',
	'linked_document',
	'communicated_with',
	'executed_by',
	'connected_to',
	'parent_of',
	'child_of'
);--> statement-breakpoint
CREATE TYPE "public"."organizational_memory_type" AS ENUM(
	'business_decision',
	'sop',
	'policy',
	'customer_history',
	'technician_knowledge',
	'ai_insight',
	'lesson_learned',
	'meeting_summary',
	'project_history'
);--> statement-breakpoint
CREATE TYPE "public"."knowledge_classification_level" AS ENUM('public', 'internal', 'confidential', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."knowledge_graph_action_type" AS ENUM(
	'knowledge_summary',
	'documentation_improvement',
	'relationship_insight',
	'governance_recommendation',
	'executive_knowledge_report'
);--> statement-breakpoint
CREATE TYPE "public"."knowledge_graph_action_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TYPE "public"."knowledge_graph_recommendation_status" AS ENUM('pending', 'accepted', 'dismissed', 'completed');--> statement-breakpoint
CREATE TABLE "knowledge_graph_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"entity_type" "knowledge_graph_entity_type" NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"label" text NOT NULL,
	"summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"classification" "knowledge_classification_level" DEFAULT 'internal' NOT NULL,
	"required_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_graph_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"target_entity_id" uuid NOT NULL,
	"relationship_type" "knowledge_graph_relationship_type" NOT NULL,
	"label" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_graph_relationship_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"change_type" text NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "organizational_memory_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"memory_type" "organizational_memory_type" NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"classification" "knowledge_classification_level" DEFAULT 'internal' NOT NULL,
	"required_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_entity_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_semantic_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"entity_type" "knowledge_graph_entity_type" NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"graph_entity_id" uuid,
	"title" text NOT NULL,
	"searchable_text" text NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding_hint" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"classification" "knowledge_classification_level" DEFAULT 'internal' NOT NULL,
	"required_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_search_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"query" text NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"search_mode" text DEFAULT 'hybrid' NOT NULL,
	"searched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_governance_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"classification" "knowledge_classification_level" NOT NULL,
	"retention_days" integer,
	"required_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner_user_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_graph_access_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_graph_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"recommendation" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" "knowledge_graph_recommendation_status" DEFAULT 'pending' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_graph_platform_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" "knowledge_graph_action_type" NOT NULL,
	"status" "knowledge_graph_action_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "knowledge_graph_entities" ADD CONSTRAINT "knowledge_graph_entities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_graph_relationships" ADD CONSTRAINT "knowledge_graph_relationships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_graph_relationships" ADD CONSTRAINT "knowledge_graph_relationships_source_entity_id_knowledge_graph_entities_id_fk" FOREIGN KEY ("source_entity_id") REFERENCES "public"."knowledge_graph_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_graph_relationships" ADD CONSTRAINT "knowledge_graph_relationships_target_entity_id_knowledge_graph_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."knowledge_graph_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_graph_relationship_history" ADD CONSTRAINT "knowledge_graph_relationship_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_graph_relationship_history" ADD CONSTRAINT "knowledge_graph_relationship_history_relationship_id_knowledge_graph_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."knowledge_graph_relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizational_memory_entries" ADD CONSTRAINT "organizational_memory_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizational_memory_entries" ADD CONSTRAINT "organizational_memory_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_semantic_index" ADD CONSTRAINT "knowledge_semantic_index_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_semantic_index" ADD CONSTRAINT "knowledge_semantic_index_graph_entity_id_knowledge_graph_entities_id_fk" FOREIGN KEY ("graph_entity_id") REFERENCES "public"."knowledge_graph_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_saved_searches" ADD CONSTRAINT "knowledge_saved_searches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_saved_searches" ADD CONSTRAINT "knowledge_saved_searches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_search_audit" ADD CONSTRAINT "knowledge_search_audit_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_search_audit" ADD CONSTRAINT "knowledge_search_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_governance_policies" ADD CONSTRAINT "knowledge_governance_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_governance_policies" ADD CONSTRAINT "knowledge_governance_policies_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_graph_access_audit" ADD CONSTRAINT "knowledge_graph_access_audit_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_graph_access_audit" ADD CONSTRAINT "knowledge_graph_access_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_graph_recommendations" ADD CONSTRAINT "knowledge_graph_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_graph_platform_actions" ADD CONSTRAINT "knowledge_graph_platform_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_graph_platform_actions" ADD CONSTRAINT "knowledge_graph_platform_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_graph_entities_company_type_source_idx" ON "knowledge_graph_entities" ("company_id","entity_type","source_entity_id");--> statement-breakpoint
CREATE INDEX "knowledge_graph_relationships_company_source_idx" ON "knowledge_graph_relationships" ("company_id","source_entity_id");--> statement-breakpoint
CREATE INDEX "knowledge_graph_relationships_company_target_idx" ON "knowledge_graph_relationships" ("company_id","target_entity_id");--> statement-breakpoint
CREATE INDEX "knowledge_semantic_index_company_entity_idx" ON "knowledge_semantic_index" ("company_id","entity_type","source_entity_id");--> statement-breakpoint
CREATE INDEX "knowledge_search_audit_company_searched_idx" ON "knowledge_search_audit" ("company_id","searched_at");
