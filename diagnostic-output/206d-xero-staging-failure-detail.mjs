/** 206d — distinct staging Xero sync failure causes (read-only, no secrets). */
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
const out = { label: '206d-xero-staging-failure-detail', generatedAt: new Date().toISOString() };

try {
  // Distinct failure causes: strip the long "Failed query: ..." body, keep the trailing cause.
  out.distinctFailureCauses = await sql`
    SELECT entity_type,
           regexp_replace(message, '^Failed query: .*?(params:.*)?$', 'Failed query (see fullSample)', 's') AS shape,
           count(*)::int AS n,
           min(created_at) AS oldest, max(created_at) AS newest
    FROM xero_sync_logs
    WHERE company_id = ${YGP}::uuid AND status <> 'success'
    GROUP BY entity_type, shape
    ORDER BY n DESC LIMIT 20`;

  // Full sample per entity type — last 200 chars usually contain the postgres cause.
  out.failureTails = await sql`
    SELECT DISTINCT ON (entity_type) entity_type, created_at,
           right(message, 600) AS message_tail, details
    FROM xero_sync_logs
    WHERE company_id = ${YGP}::uuid AND status <> 'success'
    ORDER BY entity_type, created_at DESC`;

  // Non-"Failed query" failures (real provider errors)
  out.nonSqlFailures = await sql`
    SELECT entity_type, left(message, 500) AS message, count(*)::int AS n,
           max(created_at) AS newest
    FROM xero_sync_logs
    WHERE company_id = ${YGP}::uuid AND status <> 'success'
      AND message NOT LIKE 'Failed query%'
    GROUP BY entity_type, left(message, 500)
    ORDER BY n DESC LIMIT 20`;

  out.duplicateContactDetail = await sql`
    SELECT xero_contact_id, count(*)::int AS n
    FROM xero_customer_mappings WHERE company_id = ${YGP}::uuid
    GROUP BY xero_contact_id HAVING count(*) > 1`;
} catch (e) {
  out.error = String(e.message || e);
} finally {
  await sql.end({ timeout: 5 });
}

fs.writeFileSync(
  path.resolve(repoRoot, 'diagnostic-output/206d-xero-staging-failure-detail.json'),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
