/** 206e — dates on records actually imported from Xero (read-only, no secrets). */
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

const text = fs.readFileSync(path.resolve(repoRoot, 'apps/api/.env.staging.local'), 'utf8');
const url = text.match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
if (!url.includes('cpkuwtaipjxeipvbssvn')) { console.error('BLOCKED: not staging'); process.exit(2); }

const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const sql = postgres(url, { max: 1, prepare: false });
const out = { label: '206e-xero-staging-imported-dates', generatedAt: new Date().toISOString() };

try {
  const cols = async (t) =>
    (
      await sql`SELECT column_name FROM information_schema.columns
                WHERE table_schema='public' AND table_name=${t} ORDER BY ordinal_position`
    ).map((r) => r.column_name);
  out.invoiceColumns = await cols('invoices');
  out.quoteColumns = await cols('quotes');

  out.xeroInvoices = await sql`
    SELECT id, invoice_number, issued_at, due_date, status, amount_cents, currency, created_at
    FROM invoices
    WHERE company_id = ${YGP}::uuid
    ORDER BY created_at DESC LIMIT 15`;

  out.xeroInvoiceDateStats = (
    await sql`SELECT count(*)::int AS n,
                     count(issued_at)::int AS with_issued_at,
                     count(due_date)::int AS with_due_date,
                     min(issued_at) AS oldest_issued, max(issued_at) AS newest_issued
              FROM invoices WHERE company_id = ${YGP}::uuid`
  )[0];

  out.xeroQuotes = await sql`
    SELECT id, quote_number, issued_at, valid_until, status, created_at
    FROM quotes
    WHERE company_id = ${YGP}::uuid
    ORDER BY created_at DESC LIMIT 10`;

  out.customersFromXero = (
    await sql`SELECT count(*)::int AS n, min(created_at) AS oldest, max(created_at) AS newest
              FROM customers WHERE company_id = ${YGP}::uuid`
  )[0];

  // Total invoices/quotes/payments in the company regardless of source
  out.totals = {};
  for (const t of ['invoices', 'quotes', 'payments', 'customers']) {
    const [r] = await sql.unsafe(
      `SELECT count(*)::int AS n FROM ${t} WHERE company_id = '${YGP}'`,
    );
    out.totals[t] = r.n;
  }

  // Any successful invoice log detail
  out.successfulInvoiceLogs = await sql`
    SELECT message, xero_entity_id, action, created_at
    FROM xero_sync_logs
    WHERE company_id = ${YGP}::uuid AND entity_type = 'invoice' AND status = 'success'
    ORDER BY created_at DESC LIMIT 10`;
} catch (e) {
  out.error = String(e.message || e);
} finally {
  await sql.end({ timeout: 5 });
}

fs.writeFileSync(
  path.resolve(repoRoot, 'diagnostic-output/206e-xero-staging-imported-dates.json'),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
