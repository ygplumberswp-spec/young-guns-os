ALTER TYPE "public"."ai_failover_reason" ADD VALUE IF NOT EXISTS 'credit_exhausted';--> statement-breakpoint
ALTER TYPE "public"."ai_failover_reason" ADD VALUE IF NOT EXISTS 'context_window_exceeded';--> statement-breakpoint
CREATE TABLE "ai_provider_resilience_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL UNIQUE,
	"fallback_order" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"retry_base_delay_ms" integer DEFAULT 500 NOT NULL,
	"queue_enabled" boolean DEFAULT true NOT NULL,
	"low_credit_warning_cents" integer DEFAULT 1000 NOT NULL,
	"high_usage_warning_tokens" integer DEFAULT 500000 NOT NULL,
	"hard_spending_limit_enabled" boolean DEFAULT false NOT NULL,
	"hard_spending_limit_cents" integer,
	"task_routing_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "ai_request_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"operation_type" text NOT NULL,
	"routing_category" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "ai_provider_resilience_configs" ADD CONSTRAINT "ai_provider_resilience_configs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_request_queue" ADD CONSTRAINT "ai_request_queue_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_request_queue" ADD CONSTRAINT "ai_request_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_request_queue_company_status_scheduled_idx" ON "ai_request_queue" ("company_id","status","scheduled_at");
