DO $$ BEGIN
  CREATE TYPE "public"."tenant_capability_type" AS ENUM('tenant_configuration', 'code_backed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."tenant_capability_status" AS ENUM(
    'draft',
    'awaiting_approval',
    'testing',
    'active',
    'attention_required',
    'disabled',
    'archived',
    'failed_deployment'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."tenant_capability_test_result" AS ENUM(
    'passed',
    'passed_with_warnings',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "tenant_capabilities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "department" text NOT NULL,
  "purpose" text NOT NULL,
  "capability_type" "tenant_capability_type" DEFAULT 'tenant_configuration' NOT NULL,
  "status" "tenant_capability_status" DEFAULT 'draft' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "base_agent_key" "agent_key",
  "extends_agent_key" "agent_key",
  "agent_profile_id" uuid REFERENCES "agent_profiles"("id") ON DELETE set null,
  "proposal" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "approval_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "risk_level" text DEFAULT 'low' NOT NULL,
  "provider_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "health_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "capability_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "app_builder_request_id" uuid,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "updated_by_user_id" uuid REFERENCES "users"("id"),
  "activated_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_capabilities_company_slug_unique"
  ON "tenant_capabilities" ("company_id", "slug");

CREATE INDEX IF NOT EXISTS "tenant_capabilities_company_status_idx"
  ON "tenant_capabilities" ("company_id", "status");

CREATE TABLE IF NOT EXISTS "tenant_capability_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "capability_id" uuid NOT NULL REFERENCES "tenant_capabilities"("id") ON DELETE cascade,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "version" integer NOT NULL,
  "status" "tenant_capability_status" NOT NULL,
  "proposal" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "change_summary" text,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tenant_capability_versions_capability_idx"
  ON "tenant_capability_versions" ("capability_id", "version");

CREATE TABLE IF NOT EXISTS "tenant_capability_tests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "capability_id" uuid NOT NULL REFERENCES "tenant_capabilities"("id") ON DELETE cascade,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "result" "tenant_capability_test_result" NOT NULL,
  "summary" text NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "tested_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "tenant_capability_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "capability_id" uuid REFERENCES "tenant_capabilities"("id") ON DELETE set null,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "event_type" text NOT NULL,
  "summary" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tenant_capability_audit_log_company_idx"
  ON "tenant_capability_audit_log" ("company_id", "created_at");
