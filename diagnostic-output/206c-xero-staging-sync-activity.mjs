/** 206c — staging Xero sync activity evidence (read-only, no secrets). */
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
const out = { label: '206c-xero-staging-sync-activity', generatedAt: new Date().toISOString(), companyId: YGP };

const has = async (t) => (await sql`SELECT to_regclass(${'public.' + t}) AS t`)[0].t !== null;

try {
  out.syncLogColumns = (
    await sql`SELECT column_name FROM information_schema.columns
              WHERE table_schema='public' AND table_name='xero_sync_logs' ORDER BY ordinal_position`
  ).map((r) => r.column_name);

  out.logsByEntityStatus = await sql`
    SELECT entity_type, status, count(*)::int AS n,
           min(created_at) AS oldest, max(created_at) AS newest
    FROM xero_sync_logs WHERE company_id = ${YGP}::uuid
    GROUP BY entity_type, status ORDER BY entity_type, status`;

  out.recentLogs = await sql`
    SELECT entity_type, status, message, created_at
    FROM xero_sync_logs WHERE company_id = ${YGP}::uuid
    ORDER BY created_at DESC LIMIT 25`;

  out.recentFailures = await sql`
    SELECT entity_type, status, message, created_at
    FROM xero_sync_logs
    WHERE company_id = ${YGP}::uuid AND status <> 'success'
    ORDER BY created_at DESC LIMIT 25`;

  if (await has('integration_sync_schedules')) {
    out.syncSchedules = await sql`
      SELECT * FROM integration_sync_schedules WHERE company_id = ${YGP}::uuid`;
  }

  // Mapping freshness / date ranges
  out.customerMappings = (
    await sql`SELECT count(*)::int AS n, min(created_at) AS oldest, max(updated_at) AS newest
              FROM xero_customer_mappings WHERE company_id = ${YGP}::uuid`
  )[0];
  out.invoiceMappings = (
    await sql`SELECT count(*)::int AS n, min(created_at) AS oldest, max(updated_at) AS newest
              FROM xero_invoice_mappings WHERE company_id = ${YGP}::uuid`
  )[0];

  // Duplicate check on Xero contact ids
  out.duplicateContactMappings = (
    await sql`SELECT count(*)::int AS n FROM (
                SELECT xero_contact_id FROM xero_customer_mappings
                WHERE company_id = ${YGP}::uuid
                GROUP BY xero_contact_id HAVING count(*) > 1) d`
  )[0].n;
} catch (e) {
  out.error = String(e.message || e);
} finally {
  await sql.end({ timeout: 5 });
}

fs.writeFileSync(
  path.resolve(repoRoot, 'diagnostic-output/206c-xero-staging-sync-activity.json'),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2, ));
