CREATE TABLE IF NOT EXISTS "integration_oauth_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" "integration_provider" NOT NULL,
  "state_hash" text NOT NULL,
  "return_path" text,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "integration_oauth_states_state_hash_idx"
  ON "integration_oauth_states" ("state_hash");

CREATE INDEX IF NOT EXISTS "integration_oauth_states_company_provider_idx"
  ON "integration_oauth_states" ("company_id", "provider");
