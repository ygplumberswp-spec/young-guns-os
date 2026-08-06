/**
 * SPI-001 staging verify — read-only table/route probe.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'),
);
const postgres = require('postgres');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/189-spi001-staging-verify.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';

function loadStagingDatabaseUrl() {
  const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
  if (!fs.existsSync(envPath)) return process.env.STAGING_DATABASE_URL || null;
  const text = fs.readFileSync(envPath, 'utf8');
  const match = text.match(/^DATABASE_URL=(.+)$/m);
  return match?.[1]?.trim().replace(/^["']|["']$/g, '') || process.env.STAGING_DATABASE_URL || null;
}

async function main() {
  const report = {
    label: '189-spi001-staging-verify',
    generatedAt: new Date().toISOString(),
    verdict: 'PENDING',
    checks: [],
    tableExists: {},
    notes: [],
  };

  const databaseUrl = loadStagingDatabaseUrl();
  if (!databaseUrl || databaseUrl.includes(FORBIDDEN)) {
    report.verdict = 'BLOCKED';
    report.notes.push('Staging DATABASE_URL unavailable or production ref');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const tables = [
      'supplier_price_import_jobs',
      'supplier_price_import_lines',
      'supplier_price_catalogue_items',
      'supplier_price_review_queue',
    ];

    for (const table of tables) {
      const [row] = await sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = ${table}
        ) AS exists
      `;
      report.tableExists[table] = row?.exists === true;
      report.checks.push({ name: `table_${table}`, pass: row?.exists === true });
    }

    const allTables = report.checks.every((c) => c.pass);
    report.verdict = allTables ? 'PASS' : 'FAIL';
    if (!allTables) {
      report.notes.push('Apply migration 0110_supplier_price_intelligence.sql on staging');
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === 'PASS' ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
