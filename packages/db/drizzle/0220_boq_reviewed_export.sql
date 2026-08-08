-- Row 102 — Reviewed BOQ export (XLSX/PDF) + reviewed-edit overlays
-- Additive. Staging-safe. Does not mutate Row99 source rows. No PO/Xero.

CREATE TABLE IF NOT EXISTS boq_import_row_reviewed_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  boq_import_id uuid NOT NULL REFERENCES boq_imports(id) ON DELETE CASCADE,
  boq_import_row_id uuid NOT NULL REFERENCES boq_import_rows(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  original_value text,
  reviewed_value text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reason_note text,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boq_import_row_reviewed_edits_field_chk CHECK (field_key IN (
    'itemCode','description','unit','quantity','displayValue'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS boq_import_row_reviewed_edits_unique_field_uidx
  ON boq_import_row_reviewed_edits (company_id, boq_import_row_id, field_key);

CREATE INDEX IF NOT EXISTS boq_import_row_reviewed_edits_import_idx
  ON boq_import_row_reviewed_edits (company_id, boq_import_id);

CREATE TABLE IF NOT EXISTS boq_reviewed_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  boq_import_id uuid NOT NULL REFERENCES boq_imports(id) ON DELETE CASCADE,
  format text NOT NULL,
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'GENERATED',
  labelled_draft_preview boolean NOT NULL DEFAULT false,
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_fingerprint_sha256 text NOT NULL,
  idempotency_key text,
  client_action_id text,
  original_filename text NOT NULL,
  file_hash_sha256 text NOT NULL,
  import_version integer NOT NULL,
  revision_label text,
  mime_type text NOT NULL,
  byte_length integer NOT NULL DEFAULT 0,
  storage_key text,
  content_base64 text,
  aura_narrative_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boq_reviewed_exports_format_chk CHECK (format IN ('XLSX','PDF')),
  CONSTRAINT boq_reviewed_exports_mode_chk CHECK (mode IN ('DRAFT_PREVIEW','REVIEWED_FINAL')),
  CONSTRAINT boq_reviewed_exports_status_chk CHECK (status IN ('GENERATED','BLOCKED','SUPERSEDED_SNAPSHOT'))
);

CREATE UNIQUE INDEX IF NOT EXISTS boq_reviewed_exports_company_idempotency_uidx
  ON boq_reviewed_exports (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS boq_reviewed_exports_company_client_action_uidx
  ON boq_reviewed_exports (company_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS boq_reviewed_exports_company_boq_idx
  ON boq_reviewed_exports (company_id, boq_import_id);

COMMENT ON TABLE boq_import_row_reviewed_edits IS
  'Row 102: authorised reviewed overlays — Row99 source rows remain immutable.';
COMMENT ON TABLE boq_reviewed_exports IS
  'Row 102: immutable audited XLSX/PDF export snapshots. No PO/Xero execution.';
