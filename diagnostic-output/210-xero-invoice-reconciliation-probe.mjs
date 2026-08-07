/**
 * Read-only staging probe — INV-0423 / INV-0424 invoice reconciliation.
 * Usage: node diagnostic-output/210-xero-invoice-reconciliation-probe.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'),
);
const postgres = require('postgres');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/210-xero-invoice-reconciliation.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const TARGET_NUMBERS = ['INV-0423', 'INV-0424'];

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

function redactRow(row) {
  if (!row) return row;
  const copy = { ...row };
  for (const key of Object.keys(copy)) {
    if (/email|phone|name|billing/i.test(key) && typeof copy[key] === 'string') {
      copy[key] = '[REDACTED]';
    }
  }
  return copy;
}

async function main() {
  const report = {
    label: '210-xero-invoice-reconciliation',
    generatedAt: new Date().toISOString(),
    headSha: process.env.HEAD_SHA || null,
    phase: 'before',
    targetNumbers: TARGET_NUMBERS,
    invoices: [],
    mappings: [],
    lineItems: [],
    notes: [],
  };

  const url = loadStagingDatabaseUrl();
  if (!url) {
    report.notes.push('No staging DATABASE_URL — skipped live probe');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`Wrote ${outPath} (skipped — no DATABASE_URL)`);
    return;
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });

  try {
    for (const num of TARGET_NUMBERS) {
      const rows = await sql`
        SELECT
          i.id,
          i.invoice_number,
          i.internal_number,
          i.xero_invoice_number,
          i.xero_reference,
          i.number_authority,
          i.status,
          i.amount_cents,
          i.subtotal_cents,
          i.vat_cents,
          i.total_cents,
          i.amount_paid_cents,
          i.currency,
          i.due_date,
          i.issued_at,
          i.created_at,
          i.updated_at
        FROM invoices i
        WHERE i.invoice_number = ${num}
           OR i.xero_invoice_number = ${num}
           OR i.internal_number = ${num}
        LIMIT 5
      `;
      report.invoices.push(...rows.map(redactRow));

      const mappings = await sql`
        SELECT
          m.id,
          m.invoice_id,
          m.xero_invoice_id,
          m.xero_invoice_number,
          m.sync_status,
          m.last_synced_at,
          m.last_successful_sync_at,
          m.last_error
        FROM xero_invoice_mappings m
        WHERE m.xero_invoice_number = ${num}
           OR m.invoice_id IN (
             SELECT id FROM invoices
             WHERE invoice_number = ${num}
                OR xero_invoice_number = ${num}
           )
        LIMIT 5
      `;
      report.mappings.push(...mappings.map(redactRow));

      if (rows.length > 0) {
        const lineItems = await sql`
          SELECT id, invoice_id, position, description, quantity,
                 unit_price_cents, line_subtotal_cents, line_vat_cents, line_total_cents
          FROM invoice_line_items
          WHERE invoice_id = ${rows[0].id}
          ORDER BY position
        `;
        report.lineItems.push(...lineItems);
      }
    }

    report.summary = {
      invoiceCount: report.invoices.length,
      mappingCount: report.mappings.length,
      lineItemCount: report.lineItems.length,
      zeroAmountInvoices: report.invoices.filter(
        (i) => (i.amount_cents ?? 0) === 0 && (i.total_cents ?? 0) === 0,
      ).length,
      missingDates: report.invoices.filter((i) => !i.due_date && !i.issued_at).length,
      syncPendingLikely: report.invoices.filter(
        (i) => i.number_authority === 'internal_pending_xero' && !i.xero_invoice_number,
      ).length,
    };
  } finally {
    await sql.end();
  }

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
