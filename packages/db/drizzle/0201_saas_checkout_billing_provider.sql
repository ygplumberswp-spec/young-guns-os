-- Department 21: SaaS checkout sessions + billing provider event ledger (staging only).
-- Separates TITAN SaaS subscription billing from Young Guns Yoco invoice payment-links.
-- No card data. No fake paid-through. No production writes.
ALTER TABLE "saas_subscriptions"
  ADD COLUMN IF NOT EXISTS "payment_provider" text;
--> statement-breakpoint
ALTER TABLE "saas_subscriptions"
  ADD COLUMN IF NOT EXISTS "provider_customer_ref" text;
--> statement-breakpoint
ALTER TABLE "saas_subscriptions"
  ADD COLUMN IF NOT EXISTS "provider_subscription_ref" text;
--> statement-breakpoint
ALTER TABLE "saas_subscriptions"
  ADD COLUMN IF NOT EXISTS "cancel_at_period_end" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_subscriptions"
  ADD COLUMN IF NOT EXISTS "payment_method_label" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_checkout_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "plan_id" uuid REFERENCES "saas_subscription_plans"("id") ON DELETE set null,
  "status" text DEFAULT 'created' NOT NULL,
  "provider" text DEFAULT 'unavailable' NOT NULL,
  "provider_session_ref" text,
  "provider_checkout_url" text,
  "currency" text DEFAULT 'ZAR' NOT NULL,
  "subtotal_cents" integer DEFAULT 0 NOT NULL,
  "tax_cents" integer DEFAULT 0 NOT NULL,
  "total_cents" integer DEFAULT 0 NOT NULL,
  "extra_seats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "client_quoted_total_cents" integer,
  "attention_message" text,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "expires_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saas_checkout_sessions_company_idx"
  ON "saas_checkout_sessions" ("company_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saas_billing_provider_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid REFERENCES "companies"("id") ON DELETE set null,
  "provider" text NOT NULL,
  "provider_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "canonical_type" text NOT NULL,
  "provider_session_ref" text,
  "provider_payment_ref" text,
  "provider_subscription_ref" text,
  "amount_cents" integer,
  "currency" text,
  "occurred_at" timestamp with time zone,
  "processed_at" timestamp with time zone,
  "processing_result" text,
  "payload_fingerprint" text,
  "safe_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saas_billing_provider_events_provider_event_uidx"
  ON "saas_billing_provider_events" ("provider", "provider_event_id");
--> statement-breakpoint
