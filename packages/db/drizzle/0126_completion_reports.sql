-- Client Completion Report Generator
-- Forward-only. Tenant-scoped reports linked to job/customer/property/invoice/document.

DO $$ BEGIN
  CREATE TYPE completion_report_status AS ENUM (
    'draft',
    'generated',
    'ready_to_send',
    'sent',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS completion_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  property_id uuid REFERENCES cx_customer_properties(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  boq_document_id uuid REFERENCES boq_documents(id) ON DELETE SET NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  report_number text NOT NULL,
  title text NOT NULL,
  status completion_report_status NOT NULL DEFAULT 'draft',
  included_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  section_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  html_body text,
  map_availability text NOT NULL DEFAULT 'unavailable_no_coordinates',
  map_place_url text,
  notes text,
  email_draft_id text,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  generated_at timestamptz,
  sent_at timestamptz,
  client_action_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS completion_reports_company_id_idx ON completion_reports(company_id);
CREATE INDEX IF NOT EXISTS completion_reports_job_id_idx ON completion_reports(job_id);
CREATE INDEX IF NOT EXISTS completion_reports_customer_id_idx ON completion_reports(customer_id);
CREATE INDEX IF NOT EXISTS completion_reports_document_id_idx ON completion_reports(document_id);
CREATE UNIQUE INDEX IF NOT EXISTS completion_reports_company_report_number_uidx
  ON completion_reports(company_id, report_number);
CREATE UNIQUE INDEX IF NOT EXISTS completion_reports_client_action_uidx
  ON completion_reports(company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;
