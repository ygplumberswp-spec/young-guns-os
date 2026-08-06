/**
 * Read-only reconciliation backfill for Xero-imported invoices with amount_cents populated
 * but total_cents = 0, and missing xero_invoice_number / number_authority on synced mappings.
 *
 * Usage (staging only):
 *   node packages/db/scripts/xero-invoice-financial-backfill.mjs
 *   node packages/db/scripts/xero-invoice-financial-backfill.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json'));
const postgres = require('postgres');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const apply = process.argv.includes('--apply');

function loadStagingDatabaseUrl() {
  const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
  if (!fs.existsSync(envPath)) return process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL || null;
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.match(/^DATABASE_URL=(.+)$/m);
  if (!match) return null;
  const url = match[1].trim().replace(/^["']|["']$/g, '');
  if (url.includes(FORBIDDEN)) throw new Error('Production DATABASE_URL ref blocked');
  if (!url.includes(STAGING_REF)) throw new Error('DATABASE_URL is not staging ref cpkuwtaipjxeipvbssvn');
  return url;
}

async function main() {
  const url = loadStagingDatabaseUrl();
  if (!url) {
    console.error('No staging DATABASE_URL');
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const report = {
    label: 'xero-invoice-financial-backfill',
    generatedAt: new Date().toISOString(),
    apply,
    candidates: [],
    updated: { invoices: 0, mappings: 0 },
  };

  try {
    const candidates = await sql`
      SELECT
        i.id,
        i.invoice_number,
        i.amount_cents,
        i.total_cents,
        i.number_authority,
        i.xero_invoice_number,
        m.id AS mapping_id,
        m.sync_status,
        m.xero_invoice_number AS mapping_xero_number
      FROM invoices i
      LEFT JOIN xero_invoice_mappings m ON m.invoice_id = i.id
      WHERE (i.total_cents = 0 AND i.amount_cents > 0)
         OR (m.sync_status = 'synced' AND i.number_authority = 'internal_pending_xero')
         OR (m.sync_status = 'synced' AND m.xero_invoice_number IS NULL AND i.invoice_number IS NOT NULL)
      ORDER BY i.updated_at DESC
      LIMIT 500
    `;

    report.candidates = candidates.map((row) => ({
      id: row.id,
      invoice_number: row.invoice_number,
      amount_cents: row.amount_cents,
      total_cents: row.total_cents,
      sync_status: row.sync_status,
    }));

    if (apply) {
      const invoiceUpdate = await sql`
        UPDATE invoices i
        SET
          total_cents = CASE WHEN i.total_cents = 0 AND i.amount_cents > 0 THEN i.amount_cents ELSE i.total_cents END,
          subtotal_cents = CASE WHEN i.subtotal_cents = 0 AND i.amount_cents > 0 THEN i.amount_cents ELSE i.subtotal_cents END,
          xero_invoice_number = COALESCE(i.xero_invoice_number, i.invoice_number),
          number_authority = CASE
            WHEN EXISTS (
              SELECT 1 FROM xero_invoice_mappings m
              WHERE m.invoice_id = i.id AND m.sync_status = 'synced'
            ) THEN 'xero'
            ELSE i.number_authority
          END,
          updated_at = NOW()
        WHERE (i.total_cents = 0 AND i.amount_cents > 0)
           OR EXISTS (
             SELECT 1 FROM xero_invoice_mappings m
             WHERE m.invoice_id = i.id AND m.sync_status = 'synced' AND i.number_authority = 'internal_pending_xero'
           )
        RETURNING i.id
      `;
      report.updated.invoices = invoiceUpdate.length;

      const mappingUpdate = await sql`
        UPDATE xero_invoice_mappings m
        SET
          xero_invoice_number = COALESCE(m.xero_invoice_number, i.invoice_number),
          updated_at = NOW()
        FROM invoices i
        WHERE m.invoice_id = i.id
          AND m.sync_status = 'synced'
          AND m.xero_invoice_number IS NULL
          AND i.invoice_number IS NOT NULL
        RETURNING m.id
      `;
      report.updated.mappings = mappingUpdate.length;
    }
  } finally {
    await sql.end();
  }

  const outPath = path.resolve(repoRoot, 'diagnostic-output/210-xero-invoice-backfill-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
