-- UX-A: Young Guns Customer → Property → Job operational contract
-- Forward-only. Do NOT apply to live DB from this change set — disposable test only.

CREATE TABLE IF NOT EXISTS job_number_counters (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  last_value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE job_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE cx_customer_properties
  ADD COLUMN IF NOT EXISTS suburb text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS unit_number text;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS job_number text,
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES cx_customer_properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_type text,
  ADD COLUMN IF NOT EXISTS priority job_priority NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS access_instructions text,
  ADD COLUMN IF NOT EXISTS customer_visible_notes text,
  ADD COLUMN IF NOT EXISTS site_contact_differs boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS snapshot_street text,
  ADD COLUMN IF NOT EXISTS snapshot_suburb text,
  ADD COLUMN IF NOT EXISTS snapshot_city text,
  ADD COLUMN IF NOT EXISTS snapshot_province text,
  ADD COLUMN IF NOT EXISTS snapshot_postal_code text,
  ADD COLUMN IF NOT EXISTS snapshot_unit text,
  ADD COLUMN IF NOT EXISTS snapshot_site_contact_name text,
  ADD COLUMN IF NOT EXISTS snapshot_site_contact_mobile text,
  ADD COLUMN IF NOT EXISTS snapshot_site_contact_email text,
  ADD COLUMN IF NOT EXISTS snapshot_customer_name text;

-- Backfill tenant-unique job numbers for existing rows (stable order by created_at, id)
WITH ranked AS (
  SELECT
    id,
    company_id,
    ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at ASC, id ASC) AS rn
  FROM jobs
  WHERE job_number IS NULL
),
upsert_counters AS (
  INSERT INTO job_number_counters (company_id, last_value, updated_at)
  SELECT company_id, MAX(rn), now()
  FROM ranked
  GROUP BY company_id
  ON CONFLICT (company_id) DO UPDATE
    SET last_value = GREATEST(job_number_counters.last_value, EXCLUDED.last_value),
        updated_at = now()
  RETURNING company_id
)
UPDATE jobs j
SET job_number = 'JOB-' || LPAD(ranked.rn::text, 6, '0')
FROM ranked
WHERE j.id = ranked.id
  AND j.job_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_company_job_number_uidx
  ON jobs (company_id, job_number)
  WHERE job_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS jobs_company_property_idx ON jobs (company_id, property_id);
CREATE INDEX IF NOT EXISTS jobs_company_priority_idx ON jobs (company_id, priority);
CREATE INDEX IF NOT EXISTS jobs_company_job_type_idx ON jobs (company_id, job_type);
