ALTER TYPE "public"."agent_key" ADD VALUE IF NOT EXISTS 'security';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'security_alert';--> statement-breakpoint
ALTER TYPE "public"."agent_task_type" ADD VALUE IF NOT EXISTS 'draft_security_action';--> statement-breakpoint
CREATE TYPE "public"."security_audit_category" AS ENUM(
	'authentication',
	'authorization',
	'financial',
	'workflow',
	'ai',
	'crm',
	'inventory',
	'fleet',
	'dispatch',
	'quality',
	'communications',
	'personal_workspace',
	'reports',
	'integrations',
	'api',
	'settings',
	'security'
);--> statement-breakpoint
CREATE TYPE "public"."security_login_event_type" AS ENUM(
	'login_success',
	'login_failed',
	'logout',
	'session_revoked',
	'suspicious'
);--> statement-breakpoint
CREATE TYPE "public"."security_risk_level" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."security_action_type" AS ENUM(
	'security_action',
	'permission_change',
	'integration_lockdown',
	'session_revocation',
	'privacy_request'
);--> statement-breakpoint
CREATE TYPE "public"."security_action_status" AS ENUM(
	'pending_approval',
	'approved',
	'rejected',
	'executed',
	'cancelled'
);--> statement-breakpoint
CREATE TYPE "public"."security_privacy_request_type" AS ENUM('data_export', 'data_deletion', 'consent_update');--> statement-breakpoint
CREATE TYPE "public"."security_privacy_request_status" AS ENUM(
	'pending',
	'in_review',
	'approved',
	'completed',
	'rejected'
);--> statement-breakpoint
CREATE TYPE "public"."security_permission_grant_type" AS ENUM('temporary', 'delegated', 'executive_override');--> statement-breakpoint
CREATE TABLE "security_tenant_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"mfa_required" boolean DEFAULT false NOT NULL,
	"session_timeout_minutes" integer DEFAULT 480 NOT NULL,
	"password_expiry_days" integer,
	"password_history_count" integer DEFAULT 5 NOT NULL,
	"max_failed_login_attempts" integer DEFAULT 5 NOT NULL,
	"trusted_device_required" boolean DEFAULT false NOT NULL,
	"personal_workspace_isolation" boolean DEFAULT true NOT NULL,
	"audit_retention_days" integer DEFAULT 365 NOT NULL,
	"popia_ready" boolean DEFAULT false NOT NULL,
	"gdpr_ready" boolean DEFAULT false NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "security_tenant_policies_company_id_unique" UNIQUE("company_id")
);--> statement-breakpoint
CREATE TABLE "security_mfa_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"totp_secret_encrypted" text,
	"backup_codes_hashed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "security_trusted_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"device_label" text NOT NULL,
	"device_fingerprint" text NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "security_webauthn_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"device_label" text,
	"sign_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "security_login_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"user_id" uuid,
	"event_type" "security_login_event_type" NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"geo_hint" text,
	"risk_level" "security_risk_level" DEFAULT 'low' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "security_password_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "security_permission_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"grant_type" "security_permission_grant_type" NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"granted_to_user_id" uuid NOT NULL,
	"granted_by_user_id" uuid,
	"expires_at" timestamp with time zone,
	"approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "security_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category" "security_audit_category" NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"user_id" uuid,
	"session_id" uuid,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "security_risk_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"risk_level" "security_risk_level" NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"source_category" "security_audit_category",
	"resolved" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "security_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action_type" "security_action_type" NOT NULL,
	"status" "security_action_status" DEFAULT 'pending_approval' NOT NULL,
	"subject" text NOT NULL,
	"recommendation" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "security_privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"request_type" "security_privacy_request_type" NOT NULL,
	"status" "security_privacy_request_status" DEFAULT 'pending' NOT NULL,
	"subject" text NOT NULL,
	"notes" text,
	"requested_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "security_file_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_id" uuid,
	"file_name" text,
	"mime_type" text,
	"content_hash" text,
	"scan_status" text DEFAULT 'pending' NOT NULL,
	"signed_url_expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "security_ai_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"agent_key" text,
	"tool_key" text,
	"event_type" text NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "security_comm_access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"channel" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"consent_verified" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "security_workspace_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"business_workspace_encrypted" boolean DEFAULT true NOT NULL,
	"personal_workspace_encrypted" boolean DEFAULT true NOT NULL,
	"independent_audit_trail" boolean DEFAULT true NOT NULL,
	"independent_ai_memory" boolean DEFAULT true NOT NULL,
	"business_agent_personal_access" boolean DEFAULT false NOT NULL,
	"personal_agent_business_exposure" boolean DEFAULT false NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "security_workspace_settings_company_id_unique" UNIQUE("company_id")
);--> statement-breakpoint
CREATE TABLE "security_api_rate_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"window_key" text NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "security_tenant_policies" ADD CONSTRAINT "security_tenant_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_tenant_policies" ADD CONSTRAINT "security_tenant_policies_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_mfa_settings" ADD CONSTRAINT "security_mfa_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_mfa_settings" ADD CONSTRAINT "security_mfa_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_trusted_devices" ADD CONSTRAINT "security_trusted_devices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_trusted_devices" ADD CONSTRAINT "security_trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_webauthn_credentials" ADD CONSTRAINT "security_webauthn_credentials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_webauthn_credentials" ADD CONSTRAINT "security_webauthn_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_login_events" ADD CONSTRAINT "security_login_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_login_events" ADD CONSTRAINT "security_login_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_password_history" ADD CONSTRAINT "security_password_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_password_history" ADD CONSTRAINT "security_password_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_permission_grants" ADD CONSTRAINT "security_permission_grants_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_permission_grants" ADD CONSTRAINT "security_permission_grants_granted_to_user_id_users_id_fk" FOREIGN KEY ("granted_to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_permission_grants" ADD CONSTRAINT "security_permission_grants_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_audit_logs" ADD CONSTRAINT "security_audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_audit_logs" ADD CONSTRAINT "security_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_risk_alerts" ADD CONSTRAINT "security_risk_alerts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_actions" ADD CONSTRAINT "security_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_actions" ADD CONSTRAINT "security_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_privacy_requests" ADD CONSTRAINT "security_privacy_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_privacy_requests" ADD CONSTRAINT "security_privacy_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_file_records" ADD CONSTRAINT "security_file_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_ai_events" ADD CONSTRAINT "security_ai_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_ai_events" ADD CONSTRAINT "security_ai_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_comm_access_logs" ADD CONSTRAINT "security_comm_access_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_comm_access_logs" ADD CONSTRAINT "security_comm_access_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_workspace_settings" ADD CONSTRAINT "security_workspace_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_workspace_settings" ADD CONSTRAINT "security_workspace_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_api_rate_counters" ADD CONSTRAINT "security_api_rate_counters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "security_mfa_settings_company_user_idx" ON "security_mfa_settings" ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "security_audit_logs_company_occurred_idx" ON "security_audit_logs" ("company_id","occurred_at");--> statement-breakpoint
CREATE INDEX "security_login_events_company_occurred_idx" ON "security_login_events" ("company_id","occurred_at");--> statement-breakpoint
CREATE INDEX "security_api_rate_counters_company_window_idx" ON "security_api_rate_counters" ("company_id","window_key");
