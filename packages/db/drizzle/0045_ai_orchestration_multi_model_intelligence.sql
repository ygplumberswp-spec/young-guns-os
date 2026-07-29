CREATE TYPE "public"."ai_provider_key" AS ENUM(
	'openai',
	'google_gemini',
	'anthropic_claude',
	'ollama',
	'azure_openai',
	'openrouter',
	'custom'
);--> statement-breakpoint
CREATE TYPE "public"."ai_provider_status" AS ENUM('active', 'inactive', 'degraded');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_health_status" AS ENUM('unknown', 'healthy', 'unhealthy', 'degraded');--> statement-breakpoint
CREATE TYPE "public"."ai_routing_category" AS ENUM(
	'reasoning',
	'coding',
	'business_analysis',
	'finance',
	'legal',
	'marketing',
	'image_understanding',
	'document_analysis',
	'long_context_analysis',
	'speech',
	'translation',
	'summarization'
);--> statement-breakpoint
CREATE TYPE "public"."ai_routing_mode" AS ENUM('automatic', 'manual');--> statement-breakpoint
CREATE TYPE "public"."ai_prompt_category" AS ENUM('system', 'department', 'agent');--> statement-breakpoint
CREATE TYPE "public"."ai_prompt_version_status" AS ENUM('draft', 'pending_approval', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ai_configuration_action_type" AS ENUM('prompt_update', 'provider_configuration');--> statement-breakpoint
CREATE TYPE "public"."ai_configuration_action_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TYPE "public"."ai_failover_reason" AS ENUM(
	'provider_unavailable',
	'timeout',
	'rate_limit',
	'degraded_performance'
);--> statement-breakpoint
CREATE TYPE "public"."ai_memory_context_type" AS ENUM(
	'business',
	'customer',
	'job',
	'finance',
	'executive',
	'workflow'
);--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider_key" "ai_provider_key" NOT NULL,
	"display_name" text NOT NULL,
	"status" "ai_provider_status" DEFAULT 'inactive' NOT NULL,
	"health_status" "ai_provider_health_status" DEFAULT 'unknown' NOT NULL,
	"api_version" text,
	"base_url" text,
	"encrypted_credentials" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority_weight" integer DEFAULT 100 NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"average_latency_ms" integer,
	"last_health_check_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"model_key" text NOT NULL,
	"display_name" text NOT NULL,
	"context_window" integer DEFAULT 8192 NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pricing_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"average_latency_ms" integer,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "ai_routing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category" "ai_routing_category" NOT NULL,
	"routing_mode" "ai_routing_mode" DEFAULT 'automatic' NOT NULL,
	"primary_provider_id" uuid,
	"primary_model_id" uuid,
	"fallback_chain" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority_order" integer DEFAULT 100 NOT NULL,
	"weight" integer DEFAULT 100 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "ai_prompt_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"category" "ai_prompt_category" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"agent_key" "agent_key",
	"current_published_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "ai_prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"content" text NOT NULL,
	"status" "ai_prompt_version_status" DEFAULT 'draft' NOT NULL,
	"change_notes" text,
	"created_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "ai_configuration_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" "ai_configuration_action_type" NOT NULL,
	"status" "ai_configuration_action_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "ai_usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider_id" uuid,
	"model_id" uuid,
	"department_key" text,
	"workflow_key" text,
	"user_id" uuid,
	"agent_run_id" uuid,
	"conversation_id" uuid,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "ai_quality_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider_id" uuid,
	"model_id" uuid,
	"agent_run_id" uuid,
	"conversation_id" uuid,
	"response_quality_score" numeric(5, 2),
	"success" boolean DEFAULT true NOT NULL,
	"correction_rate" numeric(5, 4),
	"hallucination_reported" boolean DEFAULT false NOT NULL,
	"response_time_ms" integer,
	"confidence_score" numeric(5, 4),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "ai_feedback_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"provider_id" uuid,
	"model_id" uuid,
	"agent_run_id" uuid,
	"conversation_id" uuid,
	"rating" integer,
	"correction_text" text,
	"accepted" boolean DEFAULT false NOT NULL,
	"rejected" boolean DEFAULT false NOT NULL,
	"workflow_outcome" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "ai_failover_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"from_provider_id" uuid,
	"to_provider_id" uuid,
	"reason" "ai_failover_reason" NOT NULL,
	"context_preserved" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "ai_memory_sync_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"context_type" "ai_memory_context_type" NOT NULL,
	"sync_key" text NOT NULL,
	"provider_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_routing_rules" ADD CONSTRAINT "ai_routing_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_routing_rules" ADD CONSTRAINT "ai_routing_rules_primary_provider_id_ai_providers_id_fk" FOREIGN KEY ("primary_provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_routing_rules" ADD CONSTRAINT "ai_routing_rules_primary_model_id_ai_models_id_fk" FOREIGN KEY ("primary_model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_templates" ADD CONSTRAINT "ai_prompt_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_versions" ADD CONSTRAINT "ai_prompt_versions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_versions" ADD CONSTRAINT "ai_prompt_versions_template_id_ai_prompt_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."ai_prompt_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_versions" ADD CONSTRAINT "ai_prompt_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_versions" ADD CONSTRAINT "ai_prompt_versions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_configuration_actions" ADD CONSTRAINT "ai_configuration_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_configuration_actions" ADD CONSTRAINT "ai_configuration_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_conversation_id_aura_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."aura_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_quality_evaluations" ADD CONSTRAINT "ai_quality_evaluations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_quality_evaluations" ADD CONSTRAINT "ai_quality_evaluations_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_quality_evaluations" ADD CONSTRAINT "ai_quality_evaluations_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_quality_evaluations" ADD CONSTRAINT "ai_quality_evaluations_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_quality_evaluations" ADD CONSTRAINT "ai_quality_evaluations_conversation_id_aura_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."aura_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feedback_records" ADD CONSTRAINT "ai_feedback_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feedback_records" ADD CONSTRAINT "ai_feedback_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feedback_records" ADD CONSTRAINT "ai_feedback_records_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feedback_records" ADD CONSTRAINT "ai_feedback_records_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feedback_records" ADD CONSTRAINT "ai_feedback_records_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feedback_records" ADD CONSTRAINT "ai_feedback_records_conversation_id_aura_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."aura_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_failover_events" ADD CONSTRAINT "ai_failover_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_failover_events" ADD CONSTRAINT "ai_failover_events_from_provider_id_ai_providers_id_fk" FOREIGN KEY ("from_provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_failover_events" ADD CONSTRAINT "ai_failover_events_to_provider_id_ai_providers_id_fk" FOREIGN KEY ("to_provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_sync_records" ADD CONSTRAINT "ai_memory_sync_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_sync_records" ADD CONSTRAINT "ai_memory_sync_records_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_providers_company_idx" ON "ai_providers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ai_models_provider_idx" ON "ai_models" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "ai_routing_rules_company_idx" ON "ai_routing_rules" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ai_prompt_templates_company_idx" ON "ai_prompt_templates" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ai_prompt_versions_template_idx" ON "ai_prompt_versions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "ai_configuration_actions_company_idx" ON "ai_configuration_actions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ai_usage_records_company_idx" ON "ai_usage_records" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ai_quality_evaluations_company_idx" ON "ai_quality_evaluations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ai_feedback_records_company_idx" ON "ai_feedback_records" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ai_failover_events_company_idx" ON "ai_failover_events" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ai_memory_sync_records_company_idx" ON "ai_memory_sync_records" USING btree ("company_id");--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'ai_orchestration_alert';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_prompt_update';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_provider_configuration';
