-- J-6.7F Social Connection Foundation — OAuth state storage
-- Do not run on staging/production until Owner-approved migration gate.

CREATE TYPE "social_connection_provider" AS ENUM (
  'facebook',
  'instagram',
  'google_business',
  'whatsapp_business',
  'tiktok'
);

CREATE TABLE IF NOT EXISTS "social_oauth_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" "social_connection_provider" NOT NULL,
  "state_hash" text NOT NULL UNIQUE,
  "return_path" text,
  "initiator_role_name" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "social_oauth_states_expiry_idx" ON "social_oauth_states" ("expires_at");
CREATE INDEX IF NOT EXISTS "social_oauth_states_company_provider_idx" ON "social_oauth_states" ("company_id", "provider");
