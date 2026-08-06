-- Phase 11: Job document pack foundation + approval/send workflow
-- Forward-only. Disposable / staging only — never apply to live from this change set.

DO $$ BEGIN
  CREATE TYPE job_document_pack_status AS ENUM (
    'draft',
    'internal_review',
    'approved_for_sending',
    'sent',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE job_document_pack_delivery_state AS ENUM (
    'not_sent',
    'portal_shared',
    'send_blocked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE job_document_pack_channel AS ENUM ('portal', 'email', 'whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE job_document_pack_item_type AS ENUM (
    'job_document',
    'quotation',
    'invoice',
    'certificate',
    'compliance_report',
    'photo_evidence'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS job_document_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  pack_number text NOT NULL,
  title text NOT NULL,
  status job_document_pack_status NOT NULL DEFAULT 'draft',
  delivery_channel job_document_pack_channel NOT NULL DEFAULT 'portal',
  delivery_state job_document_pack_delivery_state NOT NULL DEFAULT 'not_sent',
  notes text,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sent_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  sent_at timestamptz,
  client_action_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_document_packs_company_id_idx ON job_document_packs(company_id);
CREATE INDEX IF NOT EXISTS job_document_packs_job_id_idx ON job_document_packs(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS job_document_packs_client_action_uidx
  ON job_document_packs(company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS job_document_pack_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_id uuid NOT NULL REFERENCES job_document_packs(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  item_type job_document_pack_item_type NOT NULL DEFAULT 'job_document',
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_document_pack_items_pack_id_idx ON job_document_pack_items(pack_id);
