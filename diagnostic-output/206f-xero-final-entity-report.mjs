/** 206f — final per-entity evidence for the Xero staging verification report (read-only, no secrets). */
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
const out = { label: '206f-xero-final-entity-report', generatedAt: new Date().toISOString() };

try {
  out.connection = (
    await sql`SELECT status, last_sync_at, last_error, connected_at,
                     config->>'organisationName' AS organisation_name,
                     config->>'organisationId' AS organisation_id,
                     config->>'tenantId' AS tenant_id,
                     config->>'baseCurrency' AS base_currency,
                     (credentials_encrypted IS NOT NULL) AS credentials_encrypted_present
              FROM integration_connections
              WHERE company_id = ${YGP}::uuid AND provider = 'xero'`
  )[0];

  out.perEntity = await sql`
    SELECT entity_type,
           count(*) FILTER (WHERE status = 'success')::int AS success,
           count(*) FILTER (WHERE status <> 'success')::int AS failed,
           count(*) FILTER (WHERE status <> 'success' AND message LIKE '%Invalid time value%')::int
             AS failed_invalid_date,
           count(*) FILTER (WHERE status <> 'success' AND message LIKE '%Failed query%')::int
             AS failed_missing_table,
           min(created_at) AS first_attempt, max(created_at) AS last_attempt
    FROM xero_sync_logs WHERE company_id = ${YGP}::uuid
    GROUP BY entity_type ORDER BY entity_type`;

  out.storedRowCounts = {};
  for (const t of ['customers', 'invoices', 'quotes', 'payments']) {
    const [r] = await sql.unsafe(`SELECT count(*)::int AS n FROM ${t} WHERE company_id = '${YGP}'`);
    out.storedRowCounts[t] = r.n;
  }
  for (const t of ['xero_customer_mappings', 'xero_invoice_mappings', 'xero_payment_mappings', 'xero_quote_mappings']) {
    const [r] = await sql.unsafe(`SELECT count(*)::int AS n FROM ${t} WHERE company_id = '${YGP}'`);
    out.storedRowCounts[t] = r.n;
  }

  // Entities the ce72512 pipeline adds that have never been attempted on staging
  out.neverAttemptedEntities = ['account', 'tracking_category', 'bill', 'credit_note', 'attachment'].filter(
    (e) => !out.perEntity.some((r) => r.entity_type === e),
  );

  // Real business date range actually captured from Xero
  out.invoiceBusinessDates = (
    await sql`SELECT min(issued_at) AS oldest_issued, max(issued_at) AS newest_issued,
                     count(due_date)::int AS with_due_date, count(*)::int AS n
              FROM invoices WHERE company_id = ${YGP}::uuid`
  )[0];

  out.activeImportJobs = (
    await sql`SELECT count(*)::int AS n FROM integration_sync_jobs
              WHERE company_id = ${YGP}::uuid AND status IN ('pending','running')`
  )[0].n;

  out.recentImportJobs = await sql`
    SELECT id, status, started_at, completed_at, error_message
    FROM integration_sync_jobs WHERE company_id = ${YGP}::uuid
    ORDER BY created_at DESC LIMIT 5`;
} catch (e) {
  out.error = String(e.message || e);
} finally {
  await sql.end({ timeout: 5 });
}

fs.writeFileSync(
  path.resolve(repoRoot, 'diagnostic-output/206f-xero-final-entity-report.json'),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
