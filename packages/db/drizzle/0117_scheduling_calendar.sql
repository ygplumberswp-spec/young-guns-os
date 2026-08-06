-- CAL-001 — scheduling calendar settings + override audit (staging only)
CREATE TABLE IF NOT EXISTS company_scheduling_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  scheduling_buffer_minutes integer NOT NULL DEFAULT 15,
  default_travel_minutes integer NOT NULL DEFAULT 30,
  work_day_start_hour integer NOT NULL DEFAULT 7,
  work_day_end_hour integer NOT NULL DEFAULT 18,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS scheduling_override_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  conflict_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scheduling_override_audits_company_job_idx
  ON scheduling_override_audits (company_id, job_id, created_at DESC);
