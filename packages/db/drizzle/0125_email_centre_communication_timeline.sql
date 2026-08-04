-- TITAN Email Centre + Communication Timeline foundation
-- Attachment links prefer existing entity IDs (quotes, BOQs, invoices, etc.) — no blob re-upload.
-- Extends uc_timeline_index with job scoping. Forward-only / staging-safe (IF NOT EXISTS).

DO $$ BEGIN
  CREATE TYPE comm_attachment_kind AS ENUM (
    'quote',
    'boq',
    'invoice',
    'receipt',
    'coc',
    'report',
    'job_photo',
    'document'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_attachment_anchor_type AS ENUM (
    'inbox_item',
    'gmail_draft',
    'timeline_entry',
    'timeline_note',
    'whatsapp_message',
    'communication'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Job scoping on unified timeline (customer already present)
ALTER TABLE uc_timeline_index
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS uc_timeline_index_company_job_idx
  ON uc_timeline_index (company_id, job_id, occurred_at DESC)
  WHERE job_id IS NOT NULL;

-- Lookup helper for durable sync dedupe (source module + entity).
-- Non-unique: legacy rows may already duplicate; service upserts by lookup.
CREATE INDEX IF NOT EXISTS uc_timeline_index_company_source_idx
  ON uc_timeline_index (company_id, source_module, source_entity_id)
  WHERE source_entity_id IS NOT NULL;

-- Tenant-scoped communication attachment references (metadata + entity IDs, not blobs)
CREATE TABLE IF NOT EXISTS comm_attachment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  anchor_type comm_attachment_anchor_type NOT NULL,
  anchor_id uuid NOT NULL,
  attachment_kind comm_attachment_kind NOT NULL,
  -- Prefer linking an existing TITAN entity; optional when only a document row is referenced
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  label text NOT NULL,
  file_name text,
  mime_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comm_attachment_links_company_anchor_idx
  ON comm_attachment_links (company_id, anchor_type, anchor_id);

CREATE INDEX IF NOT EXISTS comm_attachment_links_company_entity_idx
  ON comm_attachment_links (company_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS comm_attachment_links_company_customer_idx
  ON comm_attachment_links (company_id, customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS comm_attachment_links_company_job_idx
  ON comm_attachment_links (company_id, job_id, created_at DESC)
  WHERE job_id IS NOT NULL;

-- Internal notes on the unified communication timeline
CREATE TABLE IF NOT EXISTS comm_timeline_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  body text NOT NULL,
  status_update text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comm_timeline_notes_company_created_idx
  ON comm_timeline_notes (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS comm_timeline_notes_company_customer_idx
  ON comm_timeline_notes (company_id, customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS comm_timeline_notes_company_job_idx
  ON comm_timeline_notes (company_id, job_id, created_at DESC)
  WHERE job_id IS NOT NULL;
