-- Local-only performance index for monthly AI usage aggregation during routing allowance checks.
CREATE INDEX IF NOT EXISTS "ai_usage_records_company_recorded_at_idx"
  ON "ai_usage_records" USING btree ("company_id", "recorded_at");
