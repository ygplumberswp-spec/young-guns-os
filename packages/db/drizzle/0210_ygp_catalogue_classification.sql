-- Row 91 — YGP service/item codes + catalogue classification
-- Additive only. Staging-safe. Backwards compatible.
-- Canonical sell catalogue remains inventory_items (no parallel catalogue table).
-- Does not change sell prices. Does not activate Row 92 markup.
-- Production migration = 0 from this agent run (staging only).

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS ygp_code text;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS catalogue_category text;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'OTHER';

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS classification_status text NOT NULL DEFAULT 'UNCATEGORISED';

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS is_stockable boolean NOT NULL DEFAULT true;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS source_external_id text;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS xero_item_id text;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS xero_item_code text;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS supplier_sku text;

-- Company-scoped uniqueness for YGP codes (NULLs allowed / multiple NULLs OK).
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_company_ygp_code_uidx
  ON inventory_items (company_id, ygp_code)
  WHERE ygp_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_items_company_catalogue_category_idx
  ON inventory_items (company_id, catalogue_category);

CREATE INDEX IF NOT EXISTS inventory_items_company_item_type_idx
  ON inventory_items (company_id, item_type);

CREATE INDEX IF NOT EXISTS inventory_items_company_source_external_id_idx
  ON inventory_items (company_id, source_external_id)
  WHERE source_external_id IS NOT NULL;

-- Quote line catalogue identity snapshot (forward-safe; does not rewrite historical commercial amounts).
ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS catalogue_item_id uuid;

ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS ygp_code text;

ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS catalogue_category text;

COMMENT ON COLUMN inventory_items.ygp_code IS
  'Row 91: stable Young Guns internal business code. Distinct from supplier_sku / xero_item_code.';

COMMENT ON COLUMN inventory_items.catalogue_category IS
  'Row 91: product/service taxonomy (e.g. Geysers). Distinct from quote_line_category.';

COMMENT ON COLUMN inventory_items.item_type IS
  'Row 91: PHYSICAL_ITEM | SERVICE | LABOUR | CALL_OUT | OTHER';

COMMENT ON COLUMN inventory_items.classification_status IS
  'Row 91: CLASSIFIED | UNCATEGORISED | REVIEW_REQUIRED';

COMMENT ON COLUMN inventory_items.is_stockable IS
  'Row 91: false for labour/service/call-out / price-book-only rows. Physical stock remains inventory_stock_levels.';

COMMENT ON COLUMN inventory_items.source_external_id IS
  'Row 91: import/provider external id. Never overwrite with YGP code.';

COMMENT ON COLUMN inventory_items.xero_item_id IS
  'Row 91: Xero Item GUID. Xero writes = 0 in Row 91.';

COMMENT ON COLUMN inventory_items.xero_item_code IS
  'Row 91: Xero Item Code. Distinct from ygp_code.';

COMMENT ON COLUMN inventory_items.supplier_sku IS
  'Row 91: supplier SKU. Distinct from ygp_code.';

COMMENT ON COLUMN quote_line_items.catalogue_item_id IS
  'Row 91: snapshot FK to inventory_items when selected from catalogue.';

COMMENT ON COLUMN quote_line_items.ygp_code IS
  'Row 91: snapshot of YGP code at selection. Historical commercial amounts unchanged.';

COMMENT ON COLUMN quote_line_items.catalogue_category IS
  'Row 91: snapshot of catalogue product category. Distinct from quote_line_category.';
