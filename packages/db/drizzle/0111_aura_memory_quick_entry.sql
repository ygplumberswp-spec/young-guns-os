-- AURA quick memory: owner audit trail + disable without delete
ALTER TABLE "aura_memory" ADD COLUMN IF NOT EXISTS "enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "aura_memory" ADD COLUMN IF NOT EXISTS "updated_by_user_id" uuid;
ALTER TABLE "aura_memory" ADD CONSTRAINT "aura_memory_updated_by_user_id_users_id_fk"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
